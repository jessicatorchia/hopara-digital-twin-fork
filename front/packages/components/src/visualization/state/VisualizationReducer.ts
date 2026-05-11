import actions, {ActionTypes} from '../../state/Actions'
import {getType} from 'typesafe-actions'
import {VisualizationStore} from './VisualizationStore'
import {VisualizationEditStatus} from '../VisualizationEditStatus'
import {VisualizationLoadStatus} from '../VisualizationLoadStatus'
import Visualization from '../Visualization'
import {Filters} from '../../filter/domain/Filters'
import {NotFoundError} from '@hopara/http-client'
import {Reducer} from '@hopara/state'

import {Area} from '../pages/Area'

export const visualizationListReducer: Reducer<Visualization[], ActionTypes> = (state = [], action): Visualization[] => {
  switch (action.type) {
    case getType(actions.visualization.list.success):
      return action.payload
    default:
      return state
  }
}

export const visualizationReducer: Reducer<VisualizationStore, ActionTypes> = (state = new VisualizationStore(), action) => {
  switch (action.type) {
    case getType(actions.visualization.listVisualizationPageLoaded):
      return new VisualizationStore()
    case getType(actions.visualization.routeChanged):
      return new VisualizationStore().setLoadStatus(VisualizationLoadStatus.LOADING)
    case getType(actions.objectEditor.pageLoaded):
      return state.setArea(Area.OBJECT_EDITOR)
    case getType(actions.visualization.pageLoaded):
      return state.setArea(Area.VISUALIZATION)
    case getType(actions.settings.pageLoaded):
      return state.setArea(Area.SETTINGS)
    case getType(actions.layerEditor.pageLoaded):
      return state.setArea(Area.LAYER_EDITOR)
    case getType(actions.hoc.init):
    case getType(actions.hoc.visualizationChanged):
      if (action.payload.visualizationId === state.visualization?.id) return state
      return state
        .setLoadStatus(VisualizationLoadStatus.LOADING)
        .setVisualization(new Visualization({
          id: action.payload.visualizationId,
          scope: action.payload.visualizationScope,
        }))
        .setFallbackVisualizationId(action.payload.fallbackVisualizationId)
    case getType(actions.visualizationHistory.checkoutVersion):
      return state
        .setLoadStatus(VisualizationLoadStatus.LOADING)
        .setVersion(action.payload.version)
        .setEditStatus(VisualizationEditStatus.DIRTY)
    case getType(actions.visualization.fetch.success):
    case getType(actions.visualization.refreshed):
      return state
        .setVisualization(new Visualization({
          ...action.payload.visualization,
          scope: action.payload.scope,
        }))
        .setEditStatus(state.editStatus === VisualizationEditStatus.DISCARDING ? VisualizationEditStatus.DISCARDED : VisualizationEditStatus.UPDATED)
        .setLoadStatus(VisualizationLoadStatus.LOADED)
        .setVersion(action.payload.version)
        .setFallbackVisualizationId(action.payload.fallbackVisualizationId)
    case getType(actions.visualization.fetch.failure):
      return state.setLoadStatus(action.payload.exception instanceof NotFoundError ? VisualizationLoadStatus.NOT_FOUND : VisualizationLoadStatus.ERROR)
    case getType(actions.visualization.editorDirtyExitClicked):
      return state.setExitingDestination(Area.VISUALIZATION)
    case getType(actions.navigation.dirtyGoToObjectEditorClicked):
      return state.setExitingDestination(Area.OBJECT_EDITOR)
    case getType(actions.navigation.dirtyGoToVisualizationListClicked):
      return state.setExitingDestination(Area.VISUALIZATION_LIST)
    case getType(actions.navigation.dirtyGoToLayerEditorClicked):
      return state.setExitingDestination(Area.LAYER_EDITOR)
    case getType(actions.navigation.dirtyGoToSettingsClicked):
      return state.setExitingDestination(Area.SETTINGS)
    case getType(actions.navigation.dirtyGoToFiltersClicked):
      return state.setExitingDestination(Area.VISUALIZATION)
    case getType(actions.visualization.dismissExitClicked):
      return state.setExitingDestination(undefined)
    case getType(actions.visualization.save.request):
      return state.setEditStatus(VisualizationEditStatus.SAVING)
    case getType(actions.visualization.save.success):
      return state.setEditStatus(VisualizationEditStatus.UPDATED)
    case getType(actions.visualization.editorDiscardChangesRequest):
      return state.setEditStatus(VisualizationEditStatus.DISCARDING)
        .setLoadStatus(VisualizationLoadStatus.LOADING)
        .setExitingDestination(undefined)
    case getType(actions.layer.created):
    case getType(actions.layer.visibilityChanged):
    case getType(actions.layer.queryChanged):
    case getType(actions.layer.dataSourceChanged):
    case getType(actions.layer.positionEncodingChanged):
    case getType(actions.layer.positionTypeChanged):
    case getType(actions.layer.encodingChanged):
    case getType(actions.layer.offsetEncodingChanged):
    case getType(actions.layer.sizeEncodingChanged):
    case getType(actions.layer.deleted):
    case getType(actions.layer.moved):
    case getType(actions.layer.changed):
    case getType(actions.layer.codeChanged):
    case getType(actions.layer.duplicated):
    case getType(actions.filter.fieldChanged):
    case getType(actions.filter.requiredChanged):
    case getType(actions.filter.singleChoiceChanged):
    case getType(actions.filter.delete):
    case getType(actions.filter.create.success):
    case getType(actions.filter.move):
    case getType(actions.filter.queryChanged):
    case getType(actions.filter.autoFillModeChanged):
    case getType(actions.filter.changed):
    case getType(actions.filter.comparisonTypeChanged):
    case getType(actions.visualization.save.failure):
    case getType(actions.legend.changed):
    case getType(actions.layer.transformChanged):
    case getType(actions.layer.animationChanged):
    case getType(actions.layer.orderChanged):
    case getType(actions.layer.actionDeleted):
    case getType(actions.layer.actionMoved):
    case getType(actions.layer.actionChanged):
    case getType(actions.layer.newActionRequested):
    case getType(actions.layer.typeChanged):
    case getType(actions.layer.resizeChanged):
    case getType(actions.layerTemplate.typeChanged):
    case getType(actions.layerTemplate.configChanged):
    case getType(actions.layer.ejectRequested):
    case getType(actions.floor.added):
    case getType(actions.floor.deleted):
    case getType(actions.floor.nameChanged):
    case getType(actions.floor.reordered):
    case getType(actions.grid.enable):
    case getType(actions.grid.codeChanged):
    case getType(actions.grid.sizeChanged):
    case getType(actions.grid.strokeSizeChanged):
      return state.setEditStatus(VisualizationEditStatus.DIRTY)
    case getType(actions.visualization.actionSelected):
      return state
        .selectAction(action.payload.actionId)
    case getType(actions.visualization.actionChanged):
      return state
        .changeAction(action.payload.action)
        .setEditStatus(VisualizationEditStatus.DIRTY)
    case getType(actions.visualization.actionDeleted):
      return state
        .deleteAction(action.payload.actionId)
        .setEditStatus(VisualizationEditStatus.DIRTY)
    case getType(actions.visualization.newActionRequested):
      return state
        .createAction()
        .setEditStatus(VisualizationEditStatus.DIRTY)
    case getType(actions.visualization.actionMoved):
      return state
        .moveAction(action.payload.sourceIndex, action.payload.destinationIndex)
        .setEditStatus(VisualizationEditStatus.DIRTY)
    case getType(actions.visualization.refreshPeriodChanged):
      return state
        .setRefreshPeriod(action.payload.refreshPeriod)
        .setEditStatus(VisualizationEditStatus.DIRTY)
    case getType(actions.visualization.autoNavigationChanged):
      return state
        .setAutoNavigation(action.payload.autoNavigation)
        .setEditStatus(VisualizationEditStatus.DIRTY)
    case getType(actions.visualization.advancedModeClicked):
      return state
        .setAdvancedModeArea(action.payload.area, action.payload.enabled)
    case getType(actions.settings.itemSelected):
      return state.clearAdvancedModeArea()
    case getType(actions.visualization.edited):
      return state
        .setVisualization(state.visualization?.immutableUpdate(action.payload.change))
        .setEditStatus(VisualizationEditStatus.DIRTY)
    case getType(actions.viewState.initialPositionChanged):
      return state.setEditStatus(VisualizationEditStatus.DIRTY)
    case getType(actions.viewState.initialPositionChangedSilently):
      return state.setEditStatus(VisualizationEditStatus.DIRTY)
    case getType(actions.visualization.fullScreenRequested):
      return state.setFullScreen(action.payload.fullScreen)
    case getType(actions.light.onLightChanged):
      return state
        .setLight(action.payload.name, action.payload.light)
        .setEditStatus(VisualizationEditStatus.DIRTY)
    default:
      return state
  }
}

interface VisualizationFiltersState {
  filters: Filters
  state: 'loading' | 'idle' | 'error'
}

export const visualizationFiltersReducer: Reducer<VisualizationFiltersState, ActionTypes> = (state = {
  filters: new Filters(),
  state: 'idle',
}, action) => {
  switch (action.type) {
    case getType(actions.visualization.listFilters.success):
      return {filters: action.payload.filters, state: 'idle'}
    case getType(actions.visualization.listFilters.request):
      return {filters: new Filters(), state: 'loading'}
    case getType(actions.visualization.listFilters.failure):
      return {filters: new Filters(), state: 'error'}
    default:
      return state
  }
}
