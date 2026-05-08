import {Authorization} from '@hopara/authorization'
import {httpGet, httpPut} from '@hopara/http-client'
import {Config} from '@hopara/config'
import Visualization from './Visualization'
import {get} from 'lodash/fp'
import {plainToClass} from 'class-transformer'

import {Queries, Query} from '@hopara/dataset'

import {Layers} from '../layer/Layers'
import {Filters} from '../filter/domain/Filters'
import {Legend} from '../legend/Legend'
import {parseFilters} from '../filter/FilterFactory'
import { ZoomRange } from '../zoom/ZoomRange'
import { Position, ZoomBehavior } from '../view-state/ViewState'
import { Legends } from '../legend/Legends'
import {Actions} from '../action/Actions'
import { LayerDefaults } from '../layer/LayerDefaults'
import { Lights } from '../lights/Lights'
import {Floors} from '../floor/Floors'
import {Floor} from '../floor/Floor'
import {LayerTemplate} from '../layer/template/domain/LayerTemplate'
import { Box, Range } from '@hopara/spatial'
import { Grid } from '../grid/Grid'

export async function put(
  visualizationId: string,
  partialVisualization: Partial<Visualization>,
  authorization: Authorization,
) {
  const res = await httpPut(
    Config.getValue('VISUALIZATION_API_ADDRESS'),
    `visualization/${visualizationId}`,
    partialVisualization,
    {},
    authorization,
  )
  return res.data
}

export const getLegendsFromVisualizations = (response): any[] => {
  const visualization = get('visualization', response)
  return (get(['legends'], visualization) ?? []) as Legends
}

const parseVisualization = (response): Visualization => {
  const visualization = plainToClass(Visualization, get('visualization', response), {excludeExtraneousValues: true}) || []
  visualization.actions = new Actions(...(visualization.actions ?? []))
  if (visualization.lights) visualization.lights = new Lights(visualization.lights)
  return visualization
}

const parseLegends = (response): Legends => {
  const legends = plainToClass(Legend, getLegendsFromVisualizations(response)) ?? []
  return new Legends(...legends)
}

const parseGrids = (response): Grid[] => {
  return plainToClass(Grid, response.visualization?.grids ?? [])
}

const parseQueries = (response): Queries => {
  const queries = get('queries', response)
  return new Queries(...plainToClass(Query, queries))
}

const parseFloors = (response): Floors => {
  return new Floors(...(response.visualization.floors ?? []).map((f) => new Floor(f)))
}

const parseInitialPosition = (response: any): { position: Partial<Position>, zoomRange?: ZoomRange, zoomBehavior?: ZoomBehavior, contentBoundingBox?: Box } => {
  return {
    position: response.visualization.initialPosition,
    zoomRange: response.visualization?.zoomRange ? new ZoomRange(response.visualization?.zoomRange) : undefined,
    zoomBehavior: response.visualization?.zoomBehavior,
    contentBoundingBox: response.contentBoundingBox ? new Box({
      x: new Range({
        min: response.contentBoundingBox.minX,
        max: response.contentBoundingBox.maxX,
      }),
      y: new Range({
        min: response.contentBoundingBox.minY,
        max: response.contentBoundingBox.maxY,
      }),
    }) : undefined,
  }
}

export interface VisualizationResponse {
  schema: any,
  history: any[],
  queries: Queries,
  layers: Layers,
  visualization: Visualization,
  filters: Filters,
  legends: Legends,
  layerDefaults: LayerDefaults,
  scope?: string,
  initialViewState: {
    position: Partial<Position>,
    zoomRange?: ZoomRange,
    zoomBehavior?: ZoomBehavior,
    contentBoundingBox?: Box,
  },
  layerTemplates: LayerTemplate[],
  floors: Floors,
  grids: Grid[]
}

export const parseResponse = (response): VisualizationResponse => {
  const queries = parseQueries(response)
  const initialPosition = parseInitialPosition(response)
  

  return {
    schema: get('schema', response),
    history: get('history', response),
    queries,
    scope: response.visualization.scope ?? response.visualization.id,
    layers: response.visualization.layers,
    legends: parseLegends(response),
    visualization: parseVisualization(response),
    filters: parseFilters(response),
    initialViewState: initialPosition,
    layerDefaults: response.layerDefaults,
    layerTemplates: response.layerTemplates,
    floors: parseFloors(response),
    grids: parseGrids(response),
  }
}

export async function getVisualization(
  id: string,
  fallbackVisualizationId: string | undefined,
  version: number | undefined,
  authorization: Authorization,
): Promise<VisualizationResponse> {
  const response = await httpGet(Config.getValue('BFF_API_ADDRESS', authorization.tenant), `/visualization/${id}`, {
    version,
    fallbackVisualization: fallbackVisualizationId,
    filterValueLimit: 100,
  }, authorization)
  const body = await response.data
  return parseResponse(body)
}

export async function rollbackVisualizationVersion(visualizationId: string, version: number | undefined, authorization: Authorization) {
  const res = await httpPut(Config.getValue('VISUALIZATION_API_ADDRESS'), `/visualization/${visualizationId}/rollback`, {version}, {}, authorization)
  return await res.data
}

export async function listVisualizationHistory(visualizationId: string, authorization: Authorization) {
  const res = await httpGet(Config.getValue('VISUALIZATION_API_ADDRESS'), `/visualization/${visualizationId}/history`, {}, authorization)
  return await res.data
}

export async function listVisualizations(authorization: Authorization) {
  const res = await httpGet(Config.getValue('VISUALIZATION_API_ADDRESS'), `/visualization`, {}, authorization)
  return await res.data
}
