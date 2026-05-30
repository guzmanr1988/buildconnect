import { supabase } from '@/lib/supabase'
import type { ServiceConfig, OptionGroup, ServiceOption } from '@/types'

export class CatalogMutationError extends Error {
  code: string | null
  constructor(action: string, error: { message: string; code?: string | null }) {
    super(`${action}: ${error.message}`)
    this.name = 'CatalogMutationError'
    this.code = error.code ?? null
  }
}

// PostgREST UPDATE/DELETE/INSERT silently report 0 rows affected with NO
// `error` on RLS-deny or stale id-drift (task_517 / anti-primitive-G). Force
// a `.select()` chain on every mutator so the returned data lets us assert
// the expected row count; throw a synthesized `0_ROWS` CatalogMutationError
// otherwise so the FE surfaces real failure instead of false success.
const ZERO_ROWS_CODE = 'PGRST_0_ROWS'
function assertOneRow(action: string, data: unknown[] | null) {
  const n = data?.length ?? 0
  if (n === 1) return
  throw new CatalogMutationError(action, {
    message: `expected 1 row, got ${n} (RLS-deny or stale id)`,
    code: ZERO_ROWS_CODE,
  })
}

/*
 * Service Catalog API — Phase 2 commerce-layer wiring.
 *
 * Distinct from the existing `catalog.ts` (vendor_catalog_items — per-vendor
 * flat catalog rows). This module is for the admin-owned SERVICE_CATALOG
 * shape: the nested tree of services → option_groups → options → sub_groups
 * → sub_options that powers the homeowner configurator.
 *
 * Fetches: PostgREST nested-select returns the whole tree in one round-trip.
 * Mutations: PostgREST filter-based PATCH/DELETE using business-key columns
 * (service_id, group_id, option_id, sub_group_id, sub_option_id) so the FE
 * never surfaces UUID PKs. Parent UUIDs resolved on-demand when the mutation
 * needs to pin the FK target (new options/sub_groups/sub_options).
 *
 * RLS enforced server-side: authed users read, admins write. Mutation calls
 * will 403 if the session is not admin — that's the intended behavior.
 */

/* ---------------------------------------------------------------- */
/* DB-row shapes (DTOs)                                             */
/* ---------------------------------------------------------------- */

type DbService = {
  id: string
  name: string
  tagline: string
  description: string
  badge: string | null
  badge_color: string | null
  status: 'draft' | 'live'
  features: string[]
  stat_label: string
  stat_value: string
  sort_order: number
  option_groups: DbOptionGroup[]
}

type DbOptionGroup = {
  id: string
  group_id: string
  label: string
  required: boolean
  type: 'single' | 'multi'
  reveals_on_group_id: string | null
  reveals_on_equals: string | null
  sort_order: number
  options: DbOption[]
}

type DbOption = {
  id: string
  option_id: string
  label: string
  description: string | null
  price_unit: string | null
  sort_order: number
  sub_groups: DbSubGroup[]
}

type DbSubGroup = {
  id: string
  sub_group_id: string
  label: string
  description: string | null
  required: boolean
  type: 'single' | 'multi'
  sort_order: number
  sub_options: DbSubOption[]
}

type DbSubOption = {
  id: string
  sub_option_id: string
  label: string
  description: string | null
  price_unit: string | null
  sort_order: number
}

/* ---------------------------------------------------------------- */
/* Row → ServiceConfig reshape                                      */
/* ---------------------------------------------------------------- */

function priceUnitFromDb(v: string | null): ServiceOption['priceUnit'] | undefined {
  if (v === 'flat' || v === 'square' || v === 'sqft' || v === 'linear_ft') return v
  return undefined
}

function subOptionFromRow(r: DbSubOption): ServiceOption {
  const priceUnit = priceUnitFromDb(r.price_unit)
  return {
    id: r.sub_option_id,
    label: r.label,
    ...(r.description ? { description: r.description } : {}),
    ...(priceUnit ? { priceUnit } : {}),
  }
}

function subGroupFromRow(r: DbSubGroup): OptionGroup {
  return {
    id: r.sub_group_id,
    label: r.label,
    ...(r.description ? { description: r.description } : {}),
    required: r.required,
    type: r.type,
    options: (r.sub_options ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(subOptionFromRow),
  }
}

function optionFromRow(r: DbOption): ServiceOption {
  const subGroups = (r.sub_groups ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(subGroupFromRow)
  const priceUnit = priceUnitFromDb(r.price_unit)
  return {
    id: r.option_id,
    label: r.label,
    ...(r.description ? { description: r.description } : {}),
    ...(priceUnit ? { priceUnit } : {}),
    ...(subGroups.length > 0 ? { subGroups } : {}),
  }
}

function groupFromRow(r: DbOptionGroup): OptionGroup {
  const revealsOn = r.reveals_on_group_id
    ? {
        group: r.reveals_on_group_id,
        ...(r.reveals_on_equals ? { equals: r.reveals_on_equals } : {}),
      }
    : undefined
  return {
    id: r.group_id,
    label: r.label,
    required: r.required,
    type: r.type,
    options: (r.options ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(optionFromRow),
    ...(revealsOn ? { revealsOn } : {}),
  }
}

function serviceFromRow(r: DbService): ServiceConfig {
  return {
    id: r.id as ServiceConfig['id'],
    name: r.name,
    tagline: r.tagline,
    description: r.description,
    ...(r.badge ? { badge: r.badge } : {}),
    ...(r.badge_color ? { badgeColor: r.badge_color } : {}),
    status: r.status,
    features: r.features ?? [],
    stat: { label: r.stat_label, value: r.stat_value },
    optionGroups: (r.option_groups ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(groupFromRow),
  }
}

/* ---------------------------------------------------------------- */
/* Fetch                                                             */
/* ---------------------------------------------------------------- */

const NESTED_SELECT =
  '*,option_groups(*,options(*,sub_groups(*,sub_options(*))))'

export async function fetchServiceCatalog(): Promise<ServiceConfig[]> {
  const { data, error } = await supabase
    .from('services')
    .select(NESTED_SELECT)
    .order('sort_order', { ascending: true })

  if (error) throw new CatalogMutationError('fetchServiceCatalog', error)
  if (!data) return []
  return (data as unknown as DbService[]).map(serviceFromRow)
}

/* ---------------------------------------------------------------- */
/* Service CRUD                                                     */
/* ---------------------------------------------------------------- */

export async function createService(service: ServiceConfig): Promise<void> {
  const { data, error } = await supabase
    .from('services')
    .insert({
      id: service.id,
      name: service.name,
      tagline: service.tagline,
      description: service.description,
      badge: service.badge ?? null,
      badge_color: service.badgeColor ?? null,
      status: service.status,
      phase2: service.status === 'draft',
      features: service.features,
      stat_label: service.stat.label,
      stat_value: service.stat.value,
      sort_order: 999,
    })
    .select()
  if (error) throw new CatalogMutationError('createService', error)
  assertOneRow('createService', data)
}

export async function updateService(
  id: string,
  patch: Partial<Omit<ServiceConfig, 'id' | 'optionGroups'>>
): Promise<void> {
  const dbPatch: Record<string, unknown> = {}
  if (patch.name !== undefined) dbPatch.name = patch.name
  if (patch.tagline !== undefined) dbPatch.tagline = patch.tagline
  if (patch.description !== undefined) dbPatch.description = patch.description
  if (patch.badge !== undefined) dbPatch.badge = patch.badge ?? null
  if (patch.badgeColor !== undefined) dbPatch.badge_color = patch.badgeColor ?? null
  if (patch.status !== undefined) {
    dbPatch.status = patch.status
    dbPatch.phase2 = patch.status === 'draft'
  }
  if (patch.features !== undefined) dbPatch.features = patch.features
  if (patch.stat !== undefined) {
    dbPatch.stat_label = patch.stat.label
    dbPatch.stat_value = patch.stat.value
  }

  const { data, error } = await supabase
    .from('services')
    .update(dbPatch)
    .eq('id', id)
    .select()
  if (error) throw new CatalogMutationError('updateService', error)
  assertOneRow('updateService', data)
}

export async function deleteService(id: string): Promise<void> {
  const { data, error } = await supabase.from('services').delete().eq('id', id).select()
  if (error) throw new CatalogMutationError('deleteService', error)
  assertOneRow('deleteService', data)
}

/* ---------------------------------------------------------------- */
/* Option Group CRUD                                                */
/* ---------------------------------------------------------------- */

export async function createOptionGroup(
  serviceId: string,
  group: OptionGroup
): Promise<void> {
  const { data, error } = await supabase
    .from('option_groups')
    .insert({
      service_id: serviceId,
      group_id: group.id,
      label: group.label,
      required: group.required,
      type: group.type,
      reveals_on_group_id: group.revealsOn?.group ?? null,
      reveals_on_equals: group.revealsOn?.equals ?? null,
      sort_order: 999,
    })
    .select()
  if (error) throw new CatalogMutationError('createOptionGroup', error)
  assertOneRow('createOptionGroup', data)
}

export async function updateOptionGroup(
  serviceId: string,
  groupId: string,
  patch: Partial<Omit<OptionGroup, 'id' | 'options'>>
): Promise<void> {
  const dbPatch: Record<string, unknown> = {}
  if (patch.label !== undefined) dbPatch.label = patch.label
  if (patch.required !== undefined) dbPatch.required = patch.required
  if (patch.type !== undefined) dbPatch.type = patch.type
  if (patch.revealsOn !== undefined) {
    dbPatch.reveals_on_group_id = patch.revealsOn?.group ?? null
    dbPatch.reveals_on_equals = patch.revealsOn?.equals ?? null
  }

  const { data, error } = await supabase
    .from('option_groups')
    .update(dbPatch)
    .eq('service_id', serviceId)
    .eq('group_id', groupId)
    .select()
  if (error) throw new CatalogMutationError('updateOptionGroup', error)
  assertOneRow('updateOptionGroup', data)
}

export async function deleteOptionGroup(
  serviceId: string,
  groupId: string
): Promise<void> {
  const { data, error } = await supabase
    .from('option_groups')
    .delete()
    .eq('service_id', serviceId)
    .eq('group_id', groupId)
    .select()
  if (error) throw new CatalogMutationError('deleteOptionGroup', error)
  assertOneRow('deleteOptionGroup', data)
}

/* ---------------------------------------------------------------- */
/* Option CRUD — resolves parent UUID on-demand for FK pinning      */
/* ---------------------------------------------------------------- */

async function resolveGroupUuid(
  serviceId: string,
  groupId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('option_groups')
    .select('id')
    .eq('service_id', serviceId)
    .eq('group_id', groupId)
    .maybeSingle()
  if (error) throw new CatalogMutationError('resolveGroup', error)
  if (!data) throw new Error(`resolveGroup: no match for ${serviceId}/${groupId}`)
  return data.id as string
}

export async function createOption(
  serviceId: string,
  groupId: string,
  option: ServiceOption
): Promise<void> {
  const groupUuid = await resolveGroupUuid(serviceId, groupId)
  const { data, error } = await supabase
    .from('options')
    .insert({
      option_group_id: groupUuid,
      option_id: option.id,
      label: option.label,
      description: option.description ?? null,
      price_unit: option.priceUnit ?? null,
      sort_order: 999,
    })
    .select()
  if (error) throw new CatalogMutationError('createOption', error)
  assertOneRow('createOption', data)
}

export async function updateOption(
  serviceId: string,
  groupId: string,
  optionId: string,
  patch: Partial<Omit<ServiceOption, 'id' | 'subGroups'>>
): Promise<void> {
  const groupUuid = await resolveGroupUuid(serviceId, groupId)
  const dbPatch: Record<string, unknown> = {}
  if (patch.label !== undefined) dbPatch.label = patch.label
  if (patch.description !== undefined) dbPatch.description = patch.description ?? null
  if (patch.priceUnit !== undefined) dbPatch.price_unit = patch.priceUnit ?? null
  const { data, error } = await supabase
    .from('options')
    .update(dbPatch)
    .eq('option_group_id', groupUuid)
    .eq('option_id', optionId)
    .select()
  if (error) throw new CatalogMutationError('updateOption', error)
  assertOneRow('updateOption', data)
}

export async function deleteOption(
  serviceId: string,
  groupId: string,
  optionId: string
): Promise<void> {
  const groupUuid = await resolveGroupUuid(serviceId, groupId)
  const { data, error } = await supabase
    .from('options')
    .delete()
    .eq('option_group_id', groupUuid)
    .eq('option_id', optionId)
    .select()
  if (error) throw new CatalogMutationError('deleteOption', error)
  assertOneRow('deleteOption', data)
}

/* ---------------------------------------------------------------- */
/* Sub-Group / Sub-Option CRUD                                      */
/* ---------------------------------------------------------------- */

async function resolveOptionUuid(
  serviceId: string,
  groupId: string,
  optionId: string
): Promise<string> {
  const groupUuid = await resolveGroupUuid(serviceId, groupId)
  const { data, error } = await supabase
    .from('options')
    .select('id')
    .eq('option_group_id', groupUuid)
    .eq('option_id', optionId)
    .maybeSingle()
  if (error) throw new CatalogMutationError('resolveOption', error)
  if (!data) throw new Error(`resolveOption: no match for ${serviceId}/${groupId}/${optionId}`)
  return data.id as string
}

async function resolveSubGroupUuid(
  serviceId: string,
  groupId: string,
  optionId: string,
  subGroupId: string
): Promise<string> {
  const optionUuid = await resolveOptionUuid(serviceId, groupId, optionId)
  const { data, error } = await supabase
    .from('sub_groups')
    .select('id')
    .eq('option_id', optionUuid)
    .eq('sub_group_id', subGroupId)
    .maybeSingle()
  if (error) throw new CatalogMutationError('resolveSubGroup', error)
  if (!data)
    throw new Error(`resolveSubGroup: no match for ${serviceId}/${groupId}/${optionId}/${subGroupId}`)
  return data.id as string
}

export async function createSubGroup(
  serviceId: string,
  groupId: string,
  optionId: string,
  subGroup: OptionGroup
): Promise<void> {
  const optionUuid = await resolveOptionUuid(serviceId, groupId, optionId)
  const { data, error } = await supabase
    .from('sub_groups')
    .insert({
      option_id: optionUuid,
      sub_group_id: subGroup.id,
      label: subGroup.label,
      description: subGroup.description ?? null,
      required: subGroup.required,
      type: subGroup.type,
      sort_order: 999,
    })
    .select()
  if (error) throw new CatalogMutationError('createSubGroup', error)
  assertOneRow('createSubGroup', data)
}

export async function updateSubGroup(
  serviceId: string,
  groupId: string,
  optionId: string,
  subGroupId: string,
  patch: Partial<Omit<OptionGroup, 'id' | 'options'>>
): Promise<void> {
  const optionUuid = await resolveOptionUuid(serviceId, groupId, optionId)
  const dbPatch: Record<string, unknown> = {}
  if (patch.label !== undefined) dbPatch.label = patch.label
  if (patch.description !== undefined) dbPatch.description = patch.description ?? null
  if (patch.required !== undefined) dbPatch.required = patch.required
  if (patch.type !== undefined) dbPatch.type = patch.type
  const { data, error } = await supabase
    .from('sub_groups')
    .update(dbPatch)
    .eq('option_id', optionUuid)
    .eq('sub_group_id', subGroupId)
    .select()
  if (error) throw new CatalogMutationError('updateSubGroup', error)
  assertOneRow('updateSubGroup', data)
}

export async function deleteSubGroup(
  serviceId: string,
  groupId: string,
  optionId: string,
  subGroupId: string
): Promise<void> {
  const optionUuid = await resolveOptionUuid(serviceId, groupId, optionId)
  const { data, error } = await supabase
    .from('sub_groups')
    .delete()
    .eq('option_id', optionUuid)
    .eq('sub_group_id', subGroupId)
    .select()
  if (error) throw new CatalogMutationError('deleteSubGroup', error)
  assertOneRow('deleteSubGroup', data)
}

export async function createSubOption(
  serviceId: string,
  groupId: string,
  optionId: string,
  subGroupId: string,
  subOption: ServiceOption
): Promise<void> {
  const subGroupUuid = await resolveSubGroupUuid(serviceId, groupId, optionId, subGroupId)
  const { data, error } = await supabase
    .from('sub_options')
    .insert({
      sub_group_id: subGroupUuid,
      sub_option_id: subOption.id,
      label: subOption.label,
      description: subOption.description ?? null,
      price_unit: subOption.priceUnit ?? null,
      sort_order: 999,
    })
    .select()
  if (error) throw new CatalogMutationError('createSubOption', error)
  assertOneRow('createSubOption', data)
}

export async function updateSubOption(
  serviceId: string,
  groupId: string,
  optionId: string,
  subGroupId: string,
  subOptionId: string,
  patch: Partial<Omit<ServiceOption, 'id' | 'subGroups'>>
): Promise<void> {
  const subGroupUuid = await resolveSubGroupUuid(serviceId, groupId, optionId, subGroupId)
  const dbPatch: Record<string, unknown> = {}
  if (patch.label !== undefined) dbPatch.label = patch.label
  if (patch.description !== undefined) dbPatch.description = patch.description ?? null
  if (patch.priceUnit !== undefined) dbPatch.price_unit = patch.priceUnit ?? null
  const { data, error } = await supabase
    .from('sub_options')
    .update(dbPatch)
    .eq('sub_group_id', subGroupUuid)
    .eq('sub_option_id', subOptionId)
    .select()
  if (error) throw new CatalogMutationError('updateSubOption', error)
  assertOneRow('updateSubOption', data)
}

export async function deleteSubOption(
  serviceId: string,
  groupId: string,
  optionId: string,
  subGroupId: string,
  subOptionId: string
): Promise<void> {
  const subGroupUuid = await resolveSubGroupUuid(serviceId, groupId, optionId, subGroupId)
  const { data, error } = await supabase
    .from('sub_options')
    .delete()
    .eq('sub_group_id', subGroupUuid)
    .eq('sub_option_id', subOptionId)
    .select()
  if (error) throw new CatalogMutationError('deleteSubOption', error)
  assertOneRow('deleteSubOption', data)
}

async function bulkSortOrder(
  table: 'option_groups' | 'options' | 'sub_groups' | 'sub_options',
  parentColumn: string,
  parentUuid: string,
  childIdColumn: 'group_id' | 'option_id' | 'sub_group_id' | 'sub_option_id',
  orderedIds: string[],
  action: string,
): Promise<void> {
  const results = await Promise.all(
    orderedIds.map((id, idx) =>
      supabase
        .from(table)
        .update({ sort_order: idx })
        .eq(parentColumn, parentUuid)
        .eq(childIdColumn, id)
        .select(),
    ),
  )
  const firstError = results.find((r) => r.error)?.error
  if (firstError) throw new CatalogMutationError(action, firstError)
  const zeroRowIdx = results.findIndex((r) => (r.data?.length ?? 0) !== 1)
  if (zeroRowIdx !== -1) {
    const offending = orderedIds[zeroRowIdx]
    const got = results[zeroRowIdx].data?.length ?? 0
    throw new CatalogMutationError(action, {
      message: `expected 1 row for ${childIdColumn}=${offending}, got ${got} (RLS-deny or stale id)`,
      code: ZERO_ROWS_CODE,
    })
  }
}

export async function reorderOptionGroupsApi(
  serviceId: string,
  orderedGroupIds: string[],
): Promise<void> {
  await bulkSortOrder(
    'option_groups',
    'service_id',
    serviceId,
    'group_id',
    orderedGroupIds,
    'reorderOptionGroups',
  )
}

export async function reorderOptionsApi(
  serviceId: string,
  groupId: string,
  orderedOptionIds: string[],
): Promise<void> {
  const groupUuid = await resolveGroupUuid(serviceId, groupId)
  await bulkSortOrder(
    'options',
    'option_group_id',
    groupUuid,
    'option_id',
    orderedOptionIds,
    'reorderOptions',
  )
}

export async function reorderSubGroupsApi(
  serviceId: string,
  groupId: string,
  optionId: string,
  orderedSubGroupIds: string[],
): Promise<void> {
  const optionUuid = await resolveOptionUuid(serviceId, groupId, optionId)
  await bulkSortOrder(
    'sub_groups',
    'option_id',
    optionUuid,
    'sub_group_id',
    orderedSubGroupIds,
    'reorderSubGroups',
  )
}

export async function reorderSubOptionsApi(
  serviceId: string,
  groupId: string,
  optionId: string,
  subGroupId: string,
  orderedSubOptionIds: string[],
): Promise<void> {
  const subGroupUuid = await resolveSubGroupUuid(serviceId, groupId, optionId, subGroupId)
  await bulkSortOrder(
    'sub_options',
    'sub_group_id',
    subGroupUuid,
    'sub_option_id',
    orderedSubOptionIds,
    'reorderSubOptions',
  )
}
