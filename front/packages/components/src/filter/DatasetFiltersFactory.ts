import { ComparisonType as DatasetComparisonType, DatasetFilter } from '@hopara/dataset/src/filter/DatasetFilter'
import { Columns, createScopeFilter, DatasetFilters } from '@hopara/dataset'
import { SelectedFilters } from './domain/SelectedFilters'
import { Box } from '@hopara/spatial'
import { Floor } from '../floor/Floor'
import { isNil } from 'lodash/fp'
import { PositionEncoding } from '@hopara/encoding'
import { ComparisonType } from './domain/Filter'
import { getDatesFromRangeOptionArray } from './DateRangeFilter'
import { boxToFilters, PositionFields } from './BoxToFilter'
import { SelectedFilter } from './domain/SelectedFilter'

export const getBoxFilters = (positionEncoding: PositionEncoding, columns?: Columns, fetchBox?: Box) => {
  if (!fetchBox || !columns) {
    return new DatasetFilters()
  }

  const fields: PositionFields = {}
  fields.x = positionEncoding?.x?.field
  fields.y = positionEncoding?.y?.field
  fields.coordinates = positionEncoding?.coordinates?.field
  return boxToFilters(fetchBox, fields, columns)
}

export function getPositionFilters(positionEncoding: PositionEncoding, columns?: Columns, currentFloor?: Floor, fetchBox?: Box): DatasetFilters {
  const positionFilters: DatasetFilters = getBoxFilters(positionEncoding, columns, fetchBox)
  if (positionEncoding?.floor?.field && !isNil(currentFloor)) {
    positionFilters.push({
      column: positionEncoding.floor.field,
      comparisonType: DatasetComparisonType.EQUALS,
      // We need to get null values for the rows that was not assigned to a floor
      values: [currentFloor.name, null],
    })
  }

  return positionFilters
}

function convertRangedFilter(filter: SelectedFilter): DatasetFilter[] {
  const datasetFilters: DatasetFilter[] = []
  const values = getDatesFromRangeOptionArray(filter.values)

  const minValue = values[0]
  if (
    minValue !== null &&
    minValue !== undefined &&
    !Number.isNaN(minValue)) {
    const minFilter: DatasetFilter = {
      column: filter.field,
      values: [minValue],
      comparisonType: DatasetComparisonType.GREATER_EQUALS_THAN,
    }
    datasetFilters.push(minFilter)
  }

  const maxValue = values[1]
  if (
    maxValue !== null &&
    maxValue !== undefined &&
    !Number.isNaN(maxValue)) {
    const maxFilter: DatasetFilter = {
      column: filter.field,
      values: [maxValue],
      comparisonType: DatasetComparisonType.LESS_EQUALS_THAN,
    }
    datasetFilters.push(maxFilter)
  }

  return datasetFilters
}

function getDatasetComparisonType(filter: SelectedFilter): DatasetComparisonType {
  if (filter.comparisonType === ComparisonType.INTERSECTS) {
    return DatasetComparisonType.INTERSECTS
  } else if (filter.comparisonType === ComparisonType.NOT_EQUALS) {
    return DatasetComparisonType.NOT_EQUALS
  }

  return DatasetComparisonType.EQUALS
}

function convertGTEFilter(filter: SelectedFilter): DatasetFilter[] {
  return [{
    column: filter.field,
    values: filter.values,
    comparisonType: DatasetComparisonType.GREATER_EQUALS_THAN,
  }]
}

function convertLTEFilter(filter: SelectedFilter): DatasetFilter[] {
  return [{
    column: filter.field,
    values: filter.values,
    comparisonType: DatasetComparisonType.LESS_EQUALS_THAN,
  }]
}

function convertDefaultFilter(filter: SelectedFilter): DatasetFilter[] {
  return [{
    column: filter.field,
    values: filter.values,
    comparisonType: getDatasetComparisonType(filter),
  }]
}

function getColumnComparisonType(columnName: string, columns: Columns): ComparisonType {
  const column = columns.get(columnName)
  if (column?.isDatetime()) return ComparisonType.BETWEEN
  return ComparisonType.EQUALS
}

export function filterToDatasetFilter(filter: SelectedFilter, columns: Columns): DatasetFilter[] {
  const comparisonType = filter.comparisonType ?? getColumnComparisonType(filter.field, columns)
  if (comparisonType === ComparisonType.BETWEEN) return convertRangedFilter(filter)
  if (comparisonType === ComparisonType.GREATER_EQUALS_THAN) return convertGTEFilter(filter)
  if (comparisonType === ComparisonType.LESS_EQUALS_THAN) return convertLTEFilter(filter)
  return convertDefaultFilter(filter)
}

export const getSelectedFilters = (selectedFilters: SelectedFilters = new SelectedFilters(), columns: Columns, validateColumns: boolean = true): DatasetFilters => {
  if ( isNil(selectedFilters) || selectedFilters.length === 0) {
    return new DatasetFilters()
  }
  
  const filters = new DatasetFilters()

  selectedFilters.forEach((filter) => {
    const columnExists = columns.has(filter.field)
    if (!filter.values.length || (validateColumns && !columnExists)) return
    const datasetFilters = filterToDatasetFilter(filter, columns)
    datasetFilters.forEach((datasetFilter) => filters.push(datasetFilter))
  })

  return filters
}

export const getFilters = (selectedFilters: SelectedFilters, positionEncoding: PositionEncoding, 
                           columns: Columns, currentFloor?: Floor, fetchBox?: Box): DatasetFilters => {
  const filters = new DatasetFilters()

  const positionFilters = getPositionFilters(positionEncoding, columns, currentFloor, fetchBox)
  positionFilters.forEach((filter) => filters.push(filter))

  const selecteds = getSelectedFilters(selectedFilters, columns)
  selecteds.forEach((filter) => filters.push(filter))

  if (positionEncoding?.scope) filters.push(createScopeFilter(positionEncoding.scope))
  return filters
}
