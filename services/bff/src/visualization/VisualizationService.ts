import path from 'path'
import { Authorization } from '../authorization'
import { DatasetRepository } from '../query/DatasetRepository'
import { Repository as VisualizationRepository } from './VisualizationRepository'
import { LayerRepository } from '../layer/LayerRepository'
import bluebird from 'bluebird'
import { QueryKey } from '../query/Query'
import { LayerTemplateRepository } from '../layer-template/LayerTemplateRepository'
import { Visualization } from './Visualization'
import { getDefaultPositionField } from './Position'

interface GetVisualizationQueriesVm {
  id: string
  name: string
  queries: QueryKey[]
}

export class VisualizationService {
  constructor(
    private readonly visualizationRepository: VisualizationRepository,
    private readonly datasetRepository: DatasetRepository,
    private readonly layerRepository: LayerRepository,
    private readonly layerTemplateRepository: LayerTemplateRepository,
  ) {
  }

  filesToResources(files: string[], ext: string): any[] {
    return files.map((file) => {
      return {
        file,
        name: path.basename(file, ext),
      }
    })
  }

  async doGet(id: string, fallbackId: string | undefined, version: number | undefined, authorization: Authorization) {
    let visualization = await this.visualizationRepository.get(id, version, authorization)
    if (!visualization && fallbackId) {
      visualization = await this.visualizationRepository.get(fallbackId, version, authorization)
      if (visualization) {
        visualization.fallback = true
      }
    }
    return visualization
  }

  private getContentBoundingBox(visualization: Visualization, filters: any[], authorization: Authorization) {
    if (visualization.initialPosition?.type === 'FIT_TO_CONTENT') {
      const initialPositionLayer = visualization.layers.find((layer) => layer.id === visualization.initialPosition?.layerId)
      if (initialPositionLayer) {
        const data = visualization.getPositionData(initialPositionLayer)
        if (data) {
          const queryKey: QueryKey = { name: data.query, dataSource: data.source }
          const positionEncoding = initialPositionLayer?.encoding?.position
          let xColumn = positionEncoding?.x?.field || positionEncoding?.coordinates?.field
          let yColumn = positionEncoding?.y?.field || positionEncoding?.coordinates?.field

          if ( (!xColumn || !yColumn) && queryKey.dataSource === 'hopara' ) {
            xColumn = getDefaultPositionField(initialPositionLayer.type, visualization.type)
            yColumn = getDefaultPositionField(initialPositionLayer.type, visualization.type)
          }

          const scope = initialPositionLayer.encoding?.position?.scope || visualization.scope
          if ( scope ) {
            filters.push({column: "hopara_scope", values: [scope]})
          }
          return this.datasetRepository.getBoundingBox(queryKey, xColumn, yColumn, filters, authorization)
        }
      }
    }
  }

  async get(
    id: string,
    version: number,
    fallbackId: string | undefined,
    authorization: Authorization,
    filters?: any,
  ): Promise<any | null> {
    const visualization = await this.doGet(id, fallbackId, version, authorization)
    if (!visualization) return null
    if (fallbackId) visualization['id'] = id

    const [queries, layerDefaults, layerTemplates] = await Promise.all([
      this.datasetRepository.getQueries(visualization.getQueryKeys(), authorization),
      this.layerRepository.getDefaults(visualization.type),
      this.layerTemplateRepository.getTemplates(authorization),
    ])

    const contentBoundingBox = await this.getContentBoundingBox(visualization, filters, authorization)

    return {
      visualization,
      queries,
      layerDefaults,
      layerTemplates,
      contentBoundingBox,
    }
  }

  async getAllQueryKeys(authorization: Authorization): Promise<GetVisualizationQueriesVm[]> {
    const visualizations = await this.visualizationRepository.list('USER', authorization)
    return bluebird.map(visualizations, async ({ id, name }) => {
      const visualization = await this.visualizationRepository.get(id, undefined, authorization)
      return {
        id,
        name,
        queries: visualization?.getQueryKeys() ?? [],
      }
    })
  }
}
