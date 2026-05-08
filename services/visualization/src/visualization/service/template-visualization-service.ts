import {TemplateRepository} from '../repository/TemplateRepository.js'
import {VisualizationService, VisualizationServiceResponse} from './visualization-service.js'
import {randomUUID} from 'node:crypto'
import {UserInfo} from '@hopara/http-server'
import {VisualizationSpec} from '../domain/spec/Visualization.js'
import { getCurrentAppVersion } from '../../schema/schema-repository.js'

export type VisualizationConfig = {
  id?: string,
  name?: string
}

export class TemplateVisualizationService {
  constructor(private readonly visualizationService: VisualizationService,
              private readonly templateRepository: TemplateRepository,
  ) {
  }

  getId(visualizationSpec: VisualizationSpec, visualizationConfig: VisualizationConfig): string {
    if (visualizationSpec.id) {
      return visualizationSpec.id
    }

    if (visualizationConfig.id) {
      return visualizationConfig.id
    }

    return randomUUID()
  }

  private async doCreate(visualizationSpec: VisualizationSpec, index: number, 
                         visualizationConfig: VisualizationConfig, userInfo: UserInfo
  ): Promise<VisualizationServiceResponse> {
    // We'll only change the first visualization, so we don't have conflicting names/ids
    if (index === 0) {
      visualizationSpec.id = this.getId(visualizationSpec, visualizationConfig)

      if (visualizationConfig.name) {
        visualizationSpec.name = visualizationConfig.name
      }

      visualizationSpec.createdVersion = getCurrentAppVersion()

      if ( visualizationSpec.layers ) {
        for ( const layer of visualizationSpec.layers) {
          if (!layer.id) {
            layer.id = randomUUID()
          }
        }
      }
    }
    return await this.visualizationService.upsert(visualizationSpec, true, userInfo)
  }

  async create(templateId: string, visualizationConfig: VisualizationConfig, userInfo: UserInfo): Promise<VisualizationServiceResponse[] | undefined> {
    const visualizationSpecs = await this.templateRepository.getVisualizations(templateId)
    const promises = visualizationSpecs.map((visualizationSpec, index) => {
      return this.doCreate(visualizationSpec, index, visualizationConfig, userInfo)
    })
    try {
      return await Promise.all(promises)
    } catch (e: any) {
      e.message = 'Error saving visualization ' + e.message
      throw e
    }
  }
}
