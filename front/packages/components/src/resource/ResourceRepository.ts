import {Config} from '@hopara/config'
import {httpGet, httpPost, httpPut, httpPutFormData, OnUploadFunction} from '@hopara/http-client'
import {Authorization} from '@hopara/authorization'
import {i18n} from '@hopara/i18n'
import {getBaseResourceUrl, ResourceHistoryItem, ResourceType} from '@hopara/resource'
import { isNil } from 'lodash'

export const DEFAULT_RESOURCE_LIBRARY = 'default'

export enum IsometricMethod {
  REALISTIC = 'realistic',
  WIREFRAME = 'wireframe',
  ISOMETRIC_TOP = 'isometric-top'
}

export class ResourceRepository {
  static async save(
    resourceId: string,
    library: string | undefined,
    resourceFile: File,
    authorization: Authorization,
    onUploadProgress: OnUploadFunction | undefined,
    resourceType: ResourceType,
  ) {
    try {
      const data = new FormData()
      data.append('file', resourceFile)
      return httpPutFormData(
        Config.getValue('RESOURCE_API_ADDRESS'),
        getBaseResourceUrl(resourceId, library, authorization.tenant, resourceType).toString(),
        data,
        authorization,
        onUploadProgress,
      )
    } catch (err: any) {
      throw new Error(err?.message ?? i18n('UNKNOWN_ERROR'))
    }
  }

  static async loadHistory(resourceId: string, library: string, authorization: Authorization, resourceType: ResourceType): Promise<ResourceHistoryItem[]> {
    const baseUrl = getBaseResourceUrl(resourceId, library, authorization.tenant, resourceType)
    const res = await httpGet(
      Config.getValue('RESOURCE_API_ADDRESS'),
      `${baseUrl}/history`,
      {limit: 20},
      authorization)
    return res.data
  }

  static async getMetadata(resourceId: string, library: string, authorization: Authorization, resourceType: ResourceType): Promise<any> {
    const baseUrl = getBaseResourceUrl(resourceId, library, authorization.tenant, resourceType)
    return httpGet(
      Config.getValue('RESOURCE_API_ADDRESS'),
      baseUrl.toString(),
      {},
      authorization,
      {headers: {accept: 'application/json'}},
    )
    .then((res) => res.data)
    .catch((err) => {
      if (err.response?.status === 404) {
        return {data: {width: 1, height: 1}, placeholder: true}
      }
      throw new Error(i18n('UNKNOWN_ERROR'))
    })
  }

  static async checkoutMetadata(resourceId: string, library: string, version: number | undefined, authorization: Authorization, resourceType: ResourceType): Promise<any> {
    const baseUrl = getBaseResourceUrl(resourceId, library, authorization.tenant, resourceType)
    return httpGet(
      Config.getValue('RESOURCE_API_ADDRESS'),
      version ? `${baseUrl}/history/${version}` : baseUrl.toString(),
      {},
      authorization,
      {headers: {accept: 'application/json'}},
    )
    .then((res) => res)
    .catch((err) => {
      if (err.response?.status === 404) {
        return {data: {width: 1, height: 1}}
      }
      throw new Error(i18n('UNKNOWN_ERROR'))
    })
  }

  static async restoreVersion(resourceId: string, library: string, version: number, authorization: Authorization, resourceType: ResourceType): Promise<any> {
    return httpPut(
      Config.getValue('RESOURCE_API_ADDRESS'),
      `${getBaseResourceUrl(resourceId, library, authorization.tenant, resourceType)}/history/${version}/restore`,
      {},
      {},
      authorization)
  }

  static async rollback(resourceId: string, library: string, version: number, authorization: Authorization, resourceType: ResourceType): Promise<any> {
    return httpPut(
      Config.getValue('RESOURCE_API_ADDRESS'),
      `${getBaseResourceUrl(resourceId, library, authorization.tenant, resourceType)}/history/${version}/rollback`,
      {},
      {},
      authorization)
  }

  static async getShape(resourceId: string, library: string | undefined, view: number | undefined, authorization: Authorization, fallbackId?: string): Promise<any> {
    const baseUrl = getBaseResourceUrl(resourceId, library, authorization.tenant, ResourceType.image)

    const params: Record<string, string> = {}
    if (fallbackId) {
      params.fallback = fallbackId
    }
    if (!isNil(view)) {
      params.angle = view.toString()
    }
    
    const response = await httpGet(
      Config.getValue('RESOURCE_API_ADDRESS'),
      baseUrl + '/shape',
      params,
      authorization,
      {headers: {accept: 'application/json'}},
    )

    return response.data.shape
  }

  static async getShapeFromGeometry(geometry: any, resourceId: string, library: string | undefined, authorization: Authorization): Promise<any> {
    const baseUrl = getBaseResourceUrl(resourceId, library, authorization.tenant, ResourceType.image)

    const response = await httpPost(
      Config.getValue('RESOURCE_API_ADDRESS'),
      baseUrl + '/shape',
      geometry,
      {},
      authorization,
      {headers: {accept: 'application/json'}},
    )

    return response.data.shape
  }

  static async getShapeBox(resourceId: string, library: string | undefined, authorization: Authorization, fallbackId?: string): Promise<any> {
    const baseUrl = getBaseResourceUrl(resourceId, library, authorization.tenant, ResourceType.image)
    if (fallbackId) {
      baseUrl.searchParams.append('fallback', fallbackId)
    }
    const response = await httpGet(
      Config.getValue('RESOURCE_API_ADDRESS'),
      baseUrl + '/shape-box',
      {},
      authorization,
      {headers: {accept: 'application/json'}},
    )

    return response.data['shape-box']
  }

  static async generateIsometric(resourceId: string, library: string | undefined, method: IsometricMethod, authorization: Authorization): Promise<any> {
    const baseUrl = getBaseResourceUrl(resourceId, library, authorization.tenant, ResourceType.image)
    try {
      const response = await httpPut(
        Config.getValue('RESOURCE_API_ADDRESS'),
        baseUrl + '/generate',
        {},
        {method},
        authorization,
        {headers: {accept: 'application/json'}},
      )
      return response.data
    } catch (e: any) {
      if (e.response?.status === 404) {
        return {dimensions: {width: 1, height: 1}}
      }
      throw new Error(i18n('UNKNOWN_ERROR'))
    }
  }
}

