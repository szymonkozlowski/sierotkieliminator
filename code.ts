// This plugin switches instances of components from one library to the same components in a different library

figma.showUI(__html__, { width: 300, height: 200 });

interface LibraryInfo {
  id: string;
  name: string;
}

async function getLibraries(): Promise<LibraryInfo[]> {
  const variableCollections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
  const librariesMap = new Map<string, string>();
  console.log("coll: ", variableCollections);
  console.log("map: ", librariesMap);

  variableCollections.forEach(collection => {
    if (collection.key && collection.libraryName) {
      librariesMap.set(collection.key, collection.libraryName);
    }
  });

  return Array.from(librariesMap).map(([id, name]) => ({ id, name }));
}

async function getAvailableLibraries() {
  console.log("Starting getAvailableLibraries function");
  try {
    const libraryInfo = await getLibraries();
    console.log(`Found ${libraryInfo.length} libraries`);
    console.log("Library info:", libraryInfo);
    figma.ui.postMessage({ type: 'libraries', libraries: libraryInfo });
  } catch (error) {
    console.error('Error fetching libraries:', error);
    figma.notify('Error fetching libraries. Please try again.');
  }
}

async function switchComponents(targetLibraryId: string) {
  console.log(`Starting switchComponents function with target library: ${targetLibraryId}`);
  const selection = figma.currentPage.selection;
  const instances = selection.filter(node => node.type === 'INSTANCE') as InstanceNode[];
  console.log(`Found ${instances.length} instances to switch`);

  if (instances.length === 0) {
    figma.notify('Please select at least one component instance.');
    return;
  }

  try {
    let successCount = 0;
    let errorCount = 0;
    let alreadyInTargetCount = 0;

    for (const instance of instances) {
      try {
        const mainComponent = await instance.getMainComponentAsync();
        if (!mainComponent) {
          throw new Error('Instance has no main component');
        }
        const componentKey = mainComponent.key;
        const componentName = mainComponent.name;
        
        console.log(`Current main component name: ${componentName}`);
        console.log(`Current main component key: ${componentKey}`);
        console.log(`Current component is remote: ${mainComponent.remote}`);
        
        console.log(`Attempting to import component with key: ${componentKey}`);
        const newComponent = await figma.importComponentByKeyAsync(componentKey);

        if (!newComponent) {
          throw new Error(`Component not found in the target library.`);
        }

        console.log(`New component found. Is remote: ${newComponent.remote}`);

        if (mainComponent.id === newComponent.id) {
          console.log('Component is already in the target library. Skipping.');
          alreadyInTargetCount++;
          continue;
        }

        instance.swapComponent(newComponent);
        
        const newMainComponent = await instance.getMainComponentAsync();
        console.log(`After swap - New main component name: ${newMainComponent?.name}`);
        console.log(`After swap - New component is remote: ${newMainComponent?.remote}`);
        
        // Force a re-render of the Figma canvas
        figma.viewport.scrollAndZoomIntoView([instance]);

        successCount++;
        console.log(`Successfully switched component`);
      } catch (error) {
        console.error(`Error switching component:`, error);
        errorCount++;
      }
    }

    let message = `Switched ${successCount} component(instance)(s) successfully.`;
    if (errorCount > 0) message += ` ${errorCount} error(s) occurred.`;
    if (alreadyInTargetCount > 0) message += ` ${alreadyInTargetCount} component(s) were already in the target library.`;
    figma.notify(message);
  } catch (error) {
    console.error('Error in switchComponents:', error);
    if (error instanceof Error) {
      figma.notify('An error occurred: ' + error.message);
    } else {
      figma.notify('An unknown error occurred');
    }
  }
}

figma.on("selectionchange", () => {
  const selection = figma.currentPage.selection;
  const instanceCount = selection.filter(node => node.type === 'INSTANCE').length;
  console.log(`Selection changed: ${instanceCount} instances selected`);
  figma.ui.postMessage({ type: 'selectionUpdate', instanceCount });
});

figma.ui.onmessage = async (msg: { type: string, targetLibrary?: string }) => {
  console.log("Received message from UI:", msg);
  if (msg.type === 'switch-components' && msg.targetLibrary) {
    await switchComponents(msg.targetLibrary);
  } else if (msg.type === 'fetch-libraries') {
    await getAvailableLibraries();
  }
};

// Fetch libraries when the plugin starts
console.log("Plugin started, fetching libraries");
getAvailableLibraries();