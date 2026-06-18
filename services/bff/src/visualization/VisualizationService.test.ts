import { LayerRepository } from '../layer/LayerRepository'
import { getDatasetRepositoryStub } from '../query/DatasetRepository.test'
import { getVisualizationRepositoryStub } from './VisualizationRepository.test'
import { VisualizationService } from './VisualizationService'
import { LayerTemplateRepository } from '../layer-template/LayerTemplateRepository'

class LayerRepositoryStub extends LayerRepository {
  constructor() {
    super(undefined as any, undefined as any, undefined as any)
  }

  getDefaults(): Promise<any> {
    return new Promise((resolve) => resolve({}))
  }
}

class LayerTemplateRepositoryStub extends LayerTemplateRepository {
  constructor() {
    super(undefined as any, undefined as any, undefined as any)
  }

  getTemplates(): Promise<any> {
    return new Promise((resolve) => resolve([]))
  }
}

it('should get an visualization', async () => {
  const service = new VisualizationService(getVisualizationRepositoryStub(), getDatasetRepositoryStub() as any,
     new LayerRepositoryStub(), new LayerTemplateRepositoryStub())
  const { visualization, queries } = await service.get(
    'any-visualization-id', 1, undefined, { tenant: 'tenant', token: 'token' }, []
  )
  expect(visualization.id).toEqual('any-visualization-id')
  expect(queries[0].columns.length).toEqual(4)
})

it('should get an visualization with fallback', async () => {
  const service = new VisualizationService(getVisualizationRepositoryStub(), getDatasetRepositoryStub() as any,
    new LayerRepositoryStub(), new LayerTemplateRepositoryStub())
  const { visualization, queries } = await service.get(
    'any-unknow-visualization-id', 1, 'any-visualization-id', { tenant: 'tenant', token: 'token' }, []
  )
  expect(visualization.id).toEqual('any-unknow-visualization-id')
  expect(queries[0].columns.length).toEqual(4)
})
