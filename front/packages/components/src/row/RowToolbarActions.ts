import { createAction } from 'typesafe-actions'
import { ViewLayerEditingMode } from '../view-layer/ViewLayerStore'
import { Row } from '@hopara/dataset'

interface GenerateIsometricPayload {
  layerId: string;
  resourceId: string;
  library: string;
  row: Row;
  rowsetId: string;
}

export const rowToolbarActions = {
  onViewLayerEditModeClicked: createAction('ROW_TOOLBAR_EDIT_MODE_CLICKED')<{ mode: ViewLayerEditingMode }>(),
  generateIsometricClicked: createAction('ROW_TOOLBAR_GENERATE_ISOMETRIC_CLICKED')<GenerateIsometricPayload>(),
  generateIsometricWireframeClicked: createAction('ROW_TOOLBAR_GENERATE_ISOMETRIC_WIREFRAME_CLICKED')<GenerateIsometricPayload>(),
  projectToIsometricClicked: createAction('ROW_TOOLBAR_PROJECT_TO_ISOMETRIC_CLICKED')<GenerateIsometricPayload>(),
  onLoad: createAction('ROW_TOOLBAR_ON_LOAD')<void>(),
  isometricImageLoaded: createAction('ROW_TOOLBAR_ISOMETRIC_IMAGE_LOADED')<{ isometricImageLoaded: boolean }>(),
  imageLoaded: createAction('ROW_TOOLBAR_IMAGE_LOADED')<{ imageLoaded: boolean }>(),
  rotateRequested: createAction('ROW_TOOLBAR_ROTATE_REQUESTED')<void>(),
}
