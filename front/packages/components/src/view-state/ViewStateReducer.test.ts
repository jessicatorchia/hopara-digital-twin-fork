import {getInitialRowParams, getJumpToLayerZoomStep, viewStateReducer as reducer, translateBearing} from './ViewStateReducer'
import ViewState, { Position } from './ViewState'
import actions from '../state/Actions'
import { Row, Rows } from '@hopara/dataset'
import { getAnyViewState } from './ViewState.test'
import { RowCoordinates } from '@hopara/spatial'
import { Layers } from '../layer/Layers'
import { Layer } from '../layer/Layer'
import { RowsetStore } from '../rowset/RowsetStore'
import { LayerStore } from '../layer/state/LayerStore'
import { Rowset } from '../rowset/Rowset'

test('should add zoom step on zoomIn request', () => {
  const currentState = new ViewState({zoom: 0} as any)
  
  const nextState = reducer(currentState, actions.navigation.zoomInRequested({}), {})
  expect(nextState?.zoom).toEqual(1)
})

test('should remove zoom step on zoomOut request', () => {
  const currentState = new ViewState({zoom: 1} as any)
  
  const nextState = reducer(currentState, actions.navigation.zoomOutRequested({}), {})
  expect(nextState?.zoom).toEqual(0)
})

test('get zoom step for layer jump', () => {
  expect(getJumpToLayerZoomStep(10, 5, 8)).toEqual(-2.5)
  expect(getJumpToLayerZoomStep(10, 12, 15)).toEqual(2)
  expect(getJumpToLayerZoomStep(10, 5, 10)).toEqual(-0.5)
})

test('get row bearing from geometry', () => {
  const viewState = getAnyViewState()

  const row = new Row({
    _coordinates: new RowCoordinates({geometry: [
      [0, 0],
      [0, 0.02],
      [0.02, 0.02],
      [0.02, 0],
      [-0, 0],
    ]}),
  })
  expect(translateBearing(viewState, row)).toEqual(0)

  const row2 = new Row({
    _coordinates: new RowCoordinates({geometry: [
      [-0.003289260562041818, 0.005163104725581715],
      [0.005163104854204903, 0.02328926033758579],
      [0.02328926048176072, 0.01483689540314722],
      [0.014836895226039815, -0.003289260466314719],
      [-0.003289260562041818, 0.005163104725581715],
    ]}),
  })
  expect(translateBearing(viewState, row2)).toEqual(24.99999903243447)

  const row3 = new Row({
    location: [[-0.003289260562041818, 0.005163104725581715]],
  })
  expect(translateBearing(viewState, row3)).toEqual(0)
})

test('get row bearing from zoom action', () => {
  const viewState = getAnyViewState()
  const zoomAction = {bearing: {field: 'location'}}
  const row = new Row({
    _coordinates: new RowCoordinates({geometry: [
      [0, 0],
      [0, 0.02],
      [0.02, 0.02],
      [0.02, 0],
      [-0, 0],
    ]}),
  })
  expect(translateBearing(viewState, row, zoomAction)).toEqual(0)

  const row2 = new Row({
    _coordinates: new RowCoordinates({geometry: [
      [-0.003289260562041818, 0.005163104725581715],
      [0.005163104854204903, 0.02328926033758579],
      [0.02328926048176072, 0.01483689540314722],
      [0.014836895226039815, -0.003289260466314719],
      [-0.003289260562041818, 0.005163104725581715],
    ]}),
  })
  expect(translateBearing(viewState, row2, zoomAction)).toEqual(24.99999903243447)

  const row3 = new Row({
    _coordinates: new RowCoordinates({geometry: [[-0.003289260562041818, 0.005163104725581715]]}),
  })
  expect(translateBearing(viewState, row3, zoomAction)).toEqual(0)
})

describe('getInitialRowParams', () => {
  test('should return viewstate initial position if initial layer doesnt exists', () => {
    const viewState = getAnyViewState()
    const globalState = {
      initialRow: {layerId: 'layerId', rowId: 'rowId'},
      layerStore: new LayerStore(),
      rowsetStore: new RowsetStore(),
    }

    expect(getInitialRowParams(viewState, globalState as any)).toEqual(viewState.getInitialPosition())
  })

  test('should return viewstate initial position if initial row doesnt exists', () => {
    const viewState = getAnyViewState()
    const globalState = {
      initialRow: {layerId: 'layerId', rowId: 'rowId'},
      layerStore: new LayerStore({layers: new Layers(Layer.fromPlain({id: 'layerId'}))}),
      rowsetStore: new RowsetStore(),
    }

    expect(getInitialRowParams(viewState, globalState as any)).toEqual(viewState.getInitialPosition())
  })

  test('should return rowset row position if it is placed', () => {
    const viewState = getAnyViewState()
    const globalState = {
      viewState,
      initialRow: {layerId: 'layerId', rowId: 'rowId'},
      layerStore: new LayerStore({layers: new Layers(Layer.fromPlain({id: 'layerId', visible: {zoomRange: {min: {value: 0}, max: {value: 10}}}}))}),
      rowsetStore: new RowsetStore({
        [Layer.fromPlain({id: 'layerId'}).getRowsetId()]: new Rowset({
          rows: new Rows(new Row({_id: 'rowId', _coordinates: RowCoordinates.fromGeometry([[0.1, 0], [0.1, 0.02], [0.02, 0.02], [0.02, 0], [0.1, 0]])})),
        }),
      }),
    }

    expect(getInitialRowParams(viewState, globalState as any)).toEqual(new Position({
      x: 0.060000000000000005,
      y: 0.01,
      z: 0,
      zoom: 12.4,
      bearing: -90,
    }))
  })

  test('should return initial row position if rowset row is not placed', () => {
    const viewState = getAnyViewState()
    const globalState = {
      viewState,
      initialRow: {layerId: 'layerId', rowId: 'rowId', row: new Row({_id: 'rowId', _coordinates: RowCoordinates.fromGeometry([[0.1, 0], [0.1, 0.02], [0.02, 0.02], [0.02, 0], [0.1, 0]])})},
      layerStore: new LayerStore({layers: new Layers(Layer.fromPlain({id: 'layerId', visible: {zoomRange: {min: {value: 0}, max: {value: 10}}}}))}),
      rowsetStore: new RowsetStore({
        [Layer.fromPlain({id: 'layerId'}).getRowsetId()]: new Rowset({
          rows: new Rows(new Row({_id: 'rowId'})),
        }),
      }),
    }

    expect(getInitialRowParams(viewState, globalState as any)).toEqual(new Position({
      x: 0.060000000000000005,
      y: 0.01,
      z: 0,
      zoom: 12.4,
      bearing: -90,
    }))
  })
})
