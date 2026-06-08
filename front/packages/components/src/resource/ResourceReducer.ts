import {getType} from 'typesafe-actions'
import actions, {ActionTypes} from '../state/Actions'
import { Reducer } from '@hopara/state'
import { IsometricMethod } from './ResourceRepository'
import { ResourceGenerateStatus, ResourceStore, ResourceUploadStatus } from './ResourceStore'

export const resourceReducer: Reducer<ResourceStore, ActionTypes> = (state = new ResourceStore(), action) => {
  switch (action.type) {
    case getType(actions.model.uploadProgress):
    case getType(actions.image.uploadProgress):
      return state.upsertUpload({
        resourceId: action.payload.resourceId,
        library: action.payload.library,
        progress: action.payload.progress,
        status: ResourceUploadStatus.UPLOADING,
      })
    case getType(actions.model.upload.success):
    case getType(actions.image.upload.success):
    case getType(actions.image.crop.success):
      return state.upsertUpload({
        library: action.payload.library,
        resourceId: action.payload.resourceId,
        status: action.payload.partial ? ResourceUploadStatus.PARTIAL : ResourceUploadStatus.UPLOADED,
      })
    case getType(actions.resource.modelProcessed):
      return state.upsertUpload({
        library: action.payload.library,
        resourceId: action.payload.resourceId,
        status: ResourceUploadStatus.UPLOADED,
      })
    case getType(actions.model.upload.failure):
    case getType(actions.image.upload.failure):
      return state.removeUpload({
        library: action.payload.library,
        resourceId: action.payload.resourceId
      })
    case getType(actions.rowToolbar.generateIsometricClicked):
      return state.upsertGenerate({
        resourceId: action.payload.resourceId,
        library: action.payload.library,
        status: ResourceGenerateStatus.GENERATING,
        method: IsometricMethod.REALISTIC,
      })
    case getType(actions.rowToolbar.generateIsometricWireframeClicked):
      return state.upsertGenerate({
        resourceId: action.payload.resourceId,
        library: action.payload.library,
        status: ResourceGenerateStatus.GENERATING,
        method: IsometricMethod.WIREFRAME,
      })
    case getType(actions.rowToolbar.projectToIsometricClicked):
      return state.upsertGenerate({
        resourceId: action.payload.resourceId,
        library: action.payload.library,
        status: ResourceGenerateStatus.GENERATING,
        method: IsometricMethod.ISOMETRIC_TOP,
      })
    case getType(actions.image.generateIsometric.success):
    case getType(actions.image.generateIsometricWireframe.success):
      return state.upsertGenerate({
        resourceId: action.payload.resourceId,
        library: action.payload.library,
        status: ResourceGenerateStatus.GENERATING,
        method: state.getGenerate(action.payload.library, action.payload.resourceId)?.method,
      })
    case getType(actions.resource.generateProgress):
      return state.upsertGenerate({
        resourceId: action.payload.resourceId,
        library: action.payload.library,
        progress: action.payload.progress,
        status: action.payload.progress === 1 ? ResourceGenerateStatus.GENERATED : ResourceGenerateStatus.GENERATING,
        method: state.getGenerate(action.payload.library, action.payload.resourceId)?.method,
      })
    case getType(actions.image.generateIsometric.failure):
    case getType(actions.image.generateIsometricWireframe.failure):
      return state.removeGenerate({
        resourceId: action.payload.resourceId,
        library: action.payload.library,
      })
    default:
      return state
  }
}

