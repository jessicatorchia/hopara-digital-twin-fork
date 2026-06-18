import { Row } from '@hopara/dataset'
import actions from '../state/Actions'
import { resourceReducer as reducer } from './ResourceReducer'
import { IsometricMethod } from './ResourceRepository'
import { ResourceGenerateStatus, ResourceStore } from './ResourceStore'

const clickPayload = {
  layerId: 'l',
  resourceId: 'r',
  library: 'lib',
  row: new Row({ _id: 'x' }),
  rowsetId: 'rs',
}

describe('resourceReducer generate method tracking', () => {
  test('records the isometric-top method when project-to-isometric is clicked', () => {
    const next = reducer(new ResourceStore(), actions.rowToolbar.projectToIsometricClicked(clickPayload), {} as any)
    const gen = next.getGenerate('lib', 'r')
    expect(gen?.status).toEqual(ResourceGenerateStatus.GENERATING)
    expect(gen?.method).toEqual(IsometricMethod.ISOMETRIC_TOP)
  })

  test('records the realistic method when generate-isometric is clicked', () => {
    const next = reducer(new ResourceStore(), actions.rowToolbar.generateIsometricClicked(clickPayload), {} as any)
    expect(next.getGenerate('lib', 'r')?.method).toEqual(IsometricMethod.REALISTIC)
  })

  test('preserves the method across progress updates', () => {
    const afterClick = reducer(new ResourceStore(), actions.rowToolbar.projectToIsometricClicked(clickPayload), {} as any)
    const afterProgress = reducer(
      afterClick,
      actions.resource.generateProgress({ resourceId: 'r', library: 'lib', progress: 0.5 }),
      {} as any,
    )
    const gen = afterProgress.getGenerate('lib', 'r')
    expect(gen?.method).toEqual(IsometricMethod.ISOMETRIC_TOP)
    expect(gen?.status).toEqual(ResourceGenerateStatus.GENERATING)
  })
})
