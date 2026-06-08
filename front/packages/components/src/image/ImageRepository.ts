import {Config} from '@hopara/config'
import {httpPost, OnUploadFunction} from '@hopara/http-client'
import {Authorization} from '@hopara/authorization'
import {ResourceRepository, IsometricMethod} from '../resource/ResourceRepository'
import {getBaseResourceUrl, ResourceHistoryItem, ResourceType} from '@hopara/resource'

export class ImageRepository {
  static async save(
    resourceId: string,
    library: string | undefined,
    resourceFile: File,
    authorization: Authorization,
    onUploadProgress: OnUploadFunction | undefined,
  ) {
    return ResourceRepository.save(resourceId, library, resourceFile, authorization, onUploadProgress, ResourceType.image)
  }

  static async loadHistory(resourceId: string, library: string, authorization: Authorization): Promise<ResourceHistoryItem[]> {
    return ResourceRepository.loadHistory(resourceId, library, authorization, ResourceType.image)
  }

  static async getMetadata(resourceId: string, library: string, authorization: Authorization): Promise<any> {
    return ResourceRepository.getMetadata(resourceId, library, authorization, ResourceType.image)
  }

  static async checkoutMetadata(resourceId: string, library: string, version: number | undefined, authorization: Authorization): Promise<any> {
    return ResourceRepository.checkoutMetadata(resourceId, library, version, authorization, ResourceType.image)
  }

  static async restoreVersion(resourceId: string, library: string, version: number, authorization: Authorization): Promise<any> {
    return ResourceRepository.restoreVersion(resourceId, library, version, authorization, ResourceType.image)
  }

  static async rollback(resourceId: string, library: string, version: number, authorization: Authorization): Promise<any> {
    return ResourceRepository.rollback(resourceId, library, version, authorization, ResourceType.image)
  }

  static async crop(imageId: string, library: string | undefined, data: any, authorization: Authorization) {
    return httpPost(
      Config.getValue('RESOURCE_API_ADDRESS'),
      `${getBaseResourceUrl(imageId, library, authorization.tenant, ResourceType.image)}/crop`,
      data,
      {},
      authorization,
    )
  }

  static async generateIsometric(resourceId: string, library: string, method: IsometricMethod, authorization: Authorization) {
    return ResourceRepository.generateIsometric(resourceId, library, method, authorization)
  }
}
