import {Columns, ColumnType, INTERNAL_DATA_SOURCE, Query} from '@hopara/dataset'
import { Data, PositionEncoding } from '@hopara/encoding'
import { isEmpty } from 'lodash'
import { LayerType } from '../../LayerType'
import { Layer } from '../../Layer'
import { QueryKey } from '@hopara/dataset/src/query/Queries'
import { PositionType } from '@hopara/encoding/src/position/PositionEncoding'
import { isEqual, isNil } from 'lodash/fp'
import { VisualizationType } from '../../../visualization/Visualization'
import { isDataRef } from '@hopara/encoding/src/data/DataRef'

export function getGeometrySuggestions(columns?:Columns) {
  if (!columns) {
    return
  }

  return columns.pickByType(ColumnType.GEOMETRY)
}

export function getSuggestion(names:string[], columns?:Columns) {
  if (!columns) {
    return
  }

  const geometryColumns = getGeometrySuggestions(columns)
  if (!isEmpty(geometryColumns)) {
    return geometryColumns![0]
  }

  names = names.map((name) => name.toLowerCase())
  const nameColumns = columns.filter((column) => names.includes(column.getName().toLowerCase()) && column.isQuantitative())
  if (nameColumns.length > 0) {
    return nameColumns[0]
  }
}

function fillWithCoordinatesSugestions(filledPositionEncoding: PositionEncoding, columns: Columns) {
  if (!filledPositionEncoding.coordinates) {
    const geometryColumns = getGeometrySuggestions(columns)
    if (!isEmpty(geometryColumns)) {
      filledPositionEncoding.coordinates = { field: geometryColumns![0].getName() }

      if (!filledPositionEncoding.getType()) {
        filledPositionEncoding.type = PositionType.CLIENT
      }
    }
  }
}

function fillWithXySuugestions(filledPositionEncoding: PositionEncoding, columns: Columns) {
  let filled = false
  if (!filledPositionEncoding.x) {
    const xSuggestion = getSuggestion(['long', 'longitude', 'lng'], columns)?.getName()
    if (xSuggestion) {
      filledPositionEncoding.x = { field: xSuggestion }
      filled = true
    }
  }

  if (!filledPositionEncoding.y) {
    const ySuggestion = getSuggestion(['lat', 'latitude'], columns)?.getName()
    if (ySuggestion) {
      filledPositionEncoding.y = { field: ySuggestion }
      filled = true
    }
  }

  if (filled && !filledPositionEncoding.getType()) {
    filledPositionEncoding.type = PositionType.CLIENT
  }
}

export function fillWithSuggestions(layer: Layer, visualizationType:VisualizationType, positionEncoding:PositionEncoding, columns:Columns) {
  const filledPositionEncoding = new PositionEncoding(positionEncoding)
  if ((visualizationType == VisualizationType.GEO || 
       visualizationType == VisualizationType.ISOMETRIC_WHITEBOARD || 
       visualizationType == VisualizationType.WHITEBOARD) &&
       !filledPositionEncoding.floor && columns.has('floor')) {
    filledPositionEncoding.floor = { field: 'floor' }
  }

  if (layer.isCoordinatesBased()) {
    fillWithCoordinatesSugestions(filledPositionEncoding, columns)
  } else {
    fillWithXySuugestions(filledPositionEncoding, columns)
  }
  
  return filledPositionEncoding
}

export function fillWithEquivalentFields(positionEncoding:PositionEncoding, columns:Columns) {
  const filledPositionEncoding = new PositionEncoding()
  filledPositionEncoding.type = positionEncoding.type

  if (positionEncoding.x?.field && columns.get(positionEncoding.x?.field)) {
    filledPositionEncoding.x = positionEncoding.x
  }

  if (positionEncoding.x2?.field && columns.get(positionEncoding.x2?.field)) {
    filledPositionEncoding.x2 = positionEncoding.x2
  }

  if (positionEncoding.y?.field && columns.get(positionEncoding.y?.field)) {
    filledPositionEncoding.y = positionEncoding.y
  }

  if (positionEncoding.y2?.field && columns.get(positionEncoding.y2?.field)) {
    filledPositionEncoding.y2 = positionEncoding.y2
  }

  if (positionEncoding.z?.field && columns.get(positionEncoding.z?.field)) {
    filledPositionEncoding.z = positionEncoding.z
  }

  if (positionEncoding.coordinates?.field && columns.get(positionEncoding.coordinates?.field)) {
    filledPositionEncoding.coordinates = positionEncoding.coordinates
  }

  filledPositionEncoding.data = positionEncoding.data
  filledPositionEncoding.scope = positionEncoding.scope
  return filledPositionEncoding
}

function getHoparaManagedData(queryKey:QueryKey) {
  const queryName = queryKey.query + '_' + queryKey.source + '_pos'
  return new Data({source: INTERNAL_DATA_SOURCE, query: queryName})
}

function getPointFields(visualizationType: VisualizationType) {
  if (visualizationType === VisualizationType.THREE_D) {
    return {
      x: {field: 'point_3d'},
      y: {field: 'point_3d'},
      z: {field: 'point_3d'},
    }
  }

  return {
    x: {field: 'point_2d'},
    y: {field: 'point_2d'},
  }
}

function getFieldsFromLayerType(layer: Layer, visualizationType:VisualizationType) {
  const type = layer.type
  if (type === LayerType.circle || type === LayerType.icon || type === LayerType.text || 
      type === LayerType.composite || type === LayerType.model) {
    return getPointFields(visualizationType)
  }

  if (type === LayerType.line) {
    return {
      coordinates: {field: 'line'},
    }
  }

  if (type === LayerType.image) {
    return {
      coordinates: {field: 'rectangle'}
    }    
  }

  if (layer.hasType(LayerType.polygon)) {
    return {
      coordinates: {field: 'polygon'},
    }
  }

  return getPointFields(visualizationType)
}

function getAllFields(visualizationType:VisualizationType) {
  return ['coordinates', ...Object.keys(getPointFields(visualizationType))]
}

function getOtherFields(layer:Layer, visualizationType:VisualizationType) {
  const layerFields = Object.keys(getFieldsFromLayerType(layer, visualizationType))
  const allField = getAllFields(visualizationType)

  return allField.filter((field) => !layerFields.includes(field))
}

export function hasChangedLayerType(positionEncoding: PositionEncoding, layer: Layer, visualizationType: VisualizationType) : boolean {
  const fields = getFieldsFromLayerType(layer, visualizationType) as any
  let hasChangedType = false

  // Check value difference
  for (const key of Object.keys(fields)) {
    if (!isEqual(positionEncoding[key], fields[key])) {
      hasChangedType = true
      break
    }
  }

  // Check key difference
  const otherFields = getOtherFields(layer, visualizationType)
  for (const key of otherFields) {
    if (positionEncoding[key]) {
      hasChangedType = true
      break
    }
  }

  return hasChangedType
}

export function createManagedPositionEncoding(layer: Layer, 
                                              visualizationType: VisualizationType,
                                              queryKey: QueryKey,
                                              scope?: string,
                                            ): PositionEncoding {
  const floor = visualizationType === VisualizationType.GEO ? {field: 'floor'} : undefined
  return new PositionEncoding({
    type: PositionType.MANAGED,
    floor,
    scope,
    data: getHoparaManagedData(queryKey),
    ...getFieldsFromLayerType(layer, visualizationType),
  })
}

export function fillWithManaged(positionEncoding:PositionEncoding, layer:Layer, visualizationType: VisualizationType, query:Query) {
  if (positionEncoding.getType() === PositionType.CLIENT) {
    return positionEncoding
  }
  
  if (positionEncoding.x || positionEncoding.y || positionEncoding.coordinates) {
    if (positionEncoding.getType() === PositionType.MANAGED && hasChangedLayerType(positionEncoding, layer, visualizationType)) {
          return createManagedPositionEncoding(layer, visualizationType, query.toQueryKey(), positionEncoding.scope)
    }
    
    return positionEncoding
  }

  if (!query.hasPrimaryKey() || visualizationType === VisualizationType.CHART) {
    return positionEncoding
  }

  return createManagedPositionEncoding(layer, visualizationType, query.toQueryKey(), positionEncoding.scope)
}

function hasFixedPosition(positionEncoding:PositionEncoding) {
  return !isNil(positionEncoding.x?.value) || !isNil(positionEncoding.y?.value) || !isNil(positionEncoding.z?.value)
}

export function autoFillPosition(positionEncoding:PositionEncoding, layer:Layer, 
                                 visualizationType:VisualizationType, positionQuery: Query, dataQuery: Query) {
  if (!positionQuery || !dataQuery) {
    return positionEncoding
  }

  if (isDataRef(positionEncoding.data)) {
    // Will be handled on DynamicDefaultFiller#fillDefaultRefData
    return positionEncoding
  }

  if (hasFixedPosition(positionEncoding)) {
    return new PositionEncoding({...positionEncoding, type: PositionType.FIXED})
  }

  if ( layer.isType(LayerType.model) && isNil(positionEncoding.getType())) {
    return new PositionEncoding({type: PositionType.FIXED, x: {value: 0}, y: {value: 0}, z: {value: 0}})
  }

  const transformType = layer.getTransform()?.type
  let filledPositionEncoding = fillWithEquivalentFields(positionEncoding, positionQuery.getColumns(transformType))
  filledPositionEncoding = fillWithSuggestions(layer, visualizationType, filledPositionEncoding, positionQuery.getColumns(transformType))
  return fillWithManaged(filledPositionEncoding, layer, visualizationType, dataQuery)
}
