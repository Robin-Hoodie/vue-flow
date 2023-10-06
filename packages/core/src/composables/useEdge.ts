import { inject, ref } from 'vue'
import { useVueFlow } from './useVueFlow'
import type { GraphEdge } from '~/types'
import { ErrorCode, VueFlowError } from '~/utils'
import { EdgeId, EdgeRef } from '~/context'

/**
 * Access an edge
 *
 * If no edge id is provided, the edge id is injected from context
 *
 * Meaning if you do not provide an id, this composable has to be called in a child of your custom edge component, or it will throw
 */
export function useEdge<T extends GraphEdge = GraphEdge>(id?: string) {
  const edgeId = id ?? inject(EdgeId, '')
  const edgeEl = inject(EdgeRef, ref(null))

  const { findEdge, emits } = useVueFlow()

  const edge = findEdge<T>(edgeId)

  if (!edge) {
    emits.error(new VueFlowError(ErrorCode.EDGE_NOT_FOUND, edgeId))
  }

  return {
    id: edgeId,
    edge,
    edgeEl,
  }
}
