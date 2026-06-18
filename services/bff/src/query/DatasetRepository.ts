import { URL } from 'url'
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import queryString from 'query-string'
import { Logger } from '@hopara/logger'
import { Queries, Query, QueryKey } from './Query'
import { Authorization } from '../authorization'
import { Column } from './Column'
import { objectsToString } from '../ObjectsToString'

export interface SearchInput {
  term: string;
  dataSource: string;
  view: String;
}

interface Row {
  [key: string]: any; // Rows can have dynamic keys and values
}

interface ApiResponse {
  rows: Row[];
  columns: any[]; // We will ignore this field
}

export type DatasetConfig = {
  url: string
}

export type DistanceSort = {
  columns: string[]
  coordinates: number[]
}

export interface Repository {
  getColumnValue (
    queryKey: QueryKey,
    fieldName: string,
    filterTerm?: string,
    limit?: number,
    authorization?: Authorization,
  ): Promise<string[] | null>

  getQueries (queryKeys: QueryKey[], authorization: Authorization): Promise<Queries>

  getRows (queryKey: QueryKey, limit: number | undefined, distanceSort: DistanceSort | undefined, authorization: Authorization): Promise<{
    rows: [],
    columns: []
  }>
}

export interface SearchResults {
  column?: string,
  comparisonType?: string,
  values: string[]
  rows: Row[]
  columns: Column[];
}

export class DatasetRepository implements Repository {
  constructor(
    private readonly httpClient: AxiosInstance,
    private readonly datasetConfig: DatasetConfig,
    private readonly logger: Logger,
  ) {
  }

  private getHeaders(authorization: Authorization): any {
    return {
      'authorization': authorization.token,
      'tenant': authorization.tenant,
    }
  }

  async get(authorization: Authorization, views: Query[]) {
    const controller = new AbortController()
    const { signal } = controller
    try {
      const promises = views.map((view) =>
        this.getViewData(
          { tenant: authorization.tenant, token: authorization.token },
          view,
          signal
        )
      )

      return await Promise.all(promises)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error: any) {
      controller.abort()
      return null
    }
  }

  async getViewData(
    authorization: Authorization,
    data: Query,
    signal?: AbortSignal
  ): Promise<{ dataSource: string, view: string, rows: Row[] }> {
    const { name, dataSource } = data
    const url = new URL(`/view/${name}/row?dataSource=${dataSource}`, this.datasetConfig.url)
    try {
      const response = await this.httpClient.request({
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authorization.token,
          'Tenant': authorization.tenant,
        },
        method: 'GET',
        url: url.href,
        signal,
      })

      if (response && response.data) {
        const responseData: ApiResponse = response.data as unknown as ApiResponse
        let rows: any[] = responseData.rows
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        rows = rows.slice(0, 1).map(({ _image, ...rest }) => rest) // Trim rows & remove _image

        return { rows, dataSource, view: name }
      } else {
        throw new Error('No data found')
      }
    } catch (error: any) {
      if (axios.isCancel(error)) {
        throw error
      } else {
        throw error
      }
    }
  }

  private async getSingleQuery(queryKey: QueryKey, authorization: Authorization): Promise<Query | null> {
    try {
      const url = new URL(`/view/${queryKey.name}`, this.datasetConfig.url)
    url.search = queryString.stringify({ dataSource: queryKey.dataSource, fullResponse: true })
      const response = await this.httpClient.request({
        headers: this.getHeaders(authorization),
        method: 'GET',
        url: url.href,
        timeout: 10 * 1000
      })
      return response.data
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: any) {
      this.logger.info(`couldn't get query ${queryKey.name}`)
      return null
    }
  }

  public async getBoundingBox(queryKey: QueryKey, xColumn: string, yColumn: string, filters: Array<{column: string, values: any[]}>, authorization: Authorization): Promise<any> {
    try {
      if (!queryKey || !xColumn || !yColumn) {
        return
      }

      const url = new URL(`/view/${queryKey.name}/bounding-box`, this.datasetConfig.url)
      const params = { dataSource: queryKey.dataSource, xColumn, yColumn } as any
      if (filters?.length > 0) {
        params['filter'] = filters
      }

      url.search = queryString.stringify(objectsToString(params))
      const response = await this.httpClient.request({
        headers: this.getHeaders(authorization),
        method: 'GET',
        url: url.href,
        timeout: 10 * 1000
      })
      return response.data
    } catch {
      this.logger.info(`couldn't get bounding box ${queryKey.name}`)
      return null
    }
  }

  async getQuery(queryKey: QueryKey, authorization: Authorization): Promise<Query | null> {
    try {
      const query = await this.getSingleQuery(queryKey, authorization)
      if (!query) {
        return null
      }
      return query
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: any) {
      return null
    }
  }

  async getQueries(queryKeys: QueryKey[], authorization: Authorization): Promise<Queries> {
    try {
      const queries = await Promise.all(queryKeys.map((queryKey) => {
        return this.getQuery(queryKey, authorization)
      }))

      return new Queries(...queries.filter((query) => !!query) as Query[])
    } catch (e: any) {
      throw new Error(`Error getting queries: ${JSON.stringify(e)}`)
    }
  }

  async getColumnValue(queryKey: QueryKey, columnName: string, filterTerm?: string,
    limit?: number, authorization?: Authorization): Promise<string[] | null> {
    try {
      this.logger.debug('getting columnValue', {
        name: queryKey.name,
        fieldName: columnName,
        limit,
        tenant: authorization?.tenant
      })
      const url = new URL(`/view/${queryKey.name}/column/${columnName}/value`, this.datasetConfig.url)

      const urlSearch: any = { dataSource: queryKey.dataSource }
      if (filterTerm) urlSearch['filterTerm'] = filterTerm
      if (limit) urlSearch['limit'] = limit
      url.search = queryString.stringify(urlSearch)

      const request: AxiosRequestConfig = {
        headers: this.getHeaders(authorization as any),
        method: 'GET',
        url: url.href,
      }

      this.logger.debug('creating request', request)

      const res = await this.httpClient.request(request)

      return res.data
    } catch (e: any) {
      this.logger.error('can not get column value', {
        name: queryKey.name,
        fieldName: columnName,
        response: e.response?.data
      })
      return null
    }
  }

  async rollback(queryKey: QueryKey, date: any, filters: any, authorization: Authorization): Promise<string[]> {
    const url = new URL(`/view/${queryKey.name}/rollback`, this.datasetConfig.url)
    url.search = queryString.stringify({ dataSource: queryKey.dataSource })

    const response = await this.httpClient.request({
      headers: this.getHeaders(authorization),
      method: 'PUT',
      url: url.href,
      data: {
        date,
        filters,
      },
      timeout: 60 * 1000,
    })

    return response.data
  }

  async getRows(queryKey: QueryKey, limit: number, distanceSort: DistanceSort | undefined, authorization: Authorization): Promise<{
    rows: [],
    columns: []
  }> {
    const url = new URL(`/view/${queryKey.name}/row`, this.datasetConfig.url)
    url.searchParams.append('dataSource', queryKey.dataSource)

    if (limit) {
      url.searchParams.append('limit', limit.toString())
    }

    if (distanceSort) {
      url.searchParams.append('distanceSort', JSON.stringify(distanceSort))
    }

    const response = await this.httpClient.request({
      headers: this.getHeaders(authorization),
      method: 'GET',
      url: url.toString(),
    })

    return response.data
  }
}
