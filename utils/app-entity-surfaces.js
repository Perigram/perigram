export const appEntityDisplayExtensions = {
  fieldGroups: {
    project: {
      workspace: [
        { path: 'data.address', i18n: 'project.address', display: 'text', priority: 5 },
        { path: 'summary.queueCount', i18n: 'project.queues', display: 'count', priority: 10 },
        { path: 'summary.totalArea', i18n: 'project.totalArea', suffix: ' m²', display: 'area', priority: 20 }
      ],
      detailFacts: [
        { path: 'data.address', i18n: 'project.address', display: 'text', priority: 10 },
        { path: 'summary.queueCount', i18n: 'project.queues', display: 'count', priority: 20 },
        { path: 'summary.totalArea', i18n: 'project.totalArea', suffix: ' m²', display: 'area', priority: 30 },
        { path: 'origin.timestamp', i18n: 'common.created', display: 'date', priority: 40 }
      ]
    },
    warehouse: {
      workspace: [
        { path: 'data.type', i18n: 'warehouse.type', display: 'text', priority: 10 },
        { path: 'data.address', i18n: 'warehouse.address', display: 'text', priority: 20 },
        { path: 'data.stats.totalBatches', i18n: 'warehouse.storedBatches', display: 'count', priority: 30 },
        { path: 'data.stats.totalSheets', i18n: 'warehouse.availableSheets', display: 'count', priority: 40 },
        { path: 'data.stats.totalRemnants', i18n: 'warehouse.remnants', display: 'count', priority: 50 },
        { path: 'data.stats.totalCassetteInstances', i18n: 'warehouse.cassetteInstances', display: 'count', priority: 60 }
      ]
    }
  },
  surfaces: {
    project: {
      surfaces: {
        workspace: {
          preview: 'none',
          fieldGroups: ['workspace'],
          dataDisplay: 'compact',
          relations: 'summary',
          actions: 'toolbar',
          status: 'interactive',
          trace: 'hidden'
        },
        detail: {
          preview: 'none',
          fieldGroups: ['detailFacts'],
          dataDisplay: 'sectioned',
          relations: 'expanded',
          actions: 'toolbar',
          status: 'interactive',
          trace: 'full'
        }
      }
    },
    warehouse: {
      surfaces: {
        workspace: {
          preview: 'none',
          fieldGroups: ['workspace'],
          dataDisplay: 'compact',
          relations: 'none',
          actions: 'toolbar',
          status: 'interactive',
          trace: 'hidden'
        }
      }
    }
  }
};
