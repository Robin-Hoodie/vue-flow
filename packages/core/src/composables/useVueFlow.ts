import { toRefs, tryOnScopeDispose } from '@vueuse/core'
import type { EffectScope } from 'vue'
import { computed, effectScope, getCurrentScope, inject, provide, reactive, watch } from 'vue'
import type { EdgeChange, FlowOptions, FlowProps, NodeChange, VueFlowStore } from '../types'
import { warn } from '../utils'
import { useActions, useGetters, useState } from '../store'
import { VueFlow } from '../context'

/**
 * Stores all currently created store instances
 */
export class Storage {
  public currentId = 0
  public flows = new Map<string, VueFlowStore>()
  static instance: Storage

  public static getInstance(): Storage {
    if (!Storage.instance) {
      Storage.instance = new Storage()
    }

    return Storage.instance
  }

  public set(id: string, flow: VueFlowStore) {
    return this.flows.set(id, flow)
  }

  public get(id: string) {
    return this.flows.get(id)
  }

  public remove(id: string) {
    return this.flows.delete(id)
  }

  public create(id: string, preloadedState?: FlowOptions): VueFlowStore {
    const state = useState()

    const reactiveState = reactive(state)

    const hooksOn = <any>{}
    for (const [n, h] of Object.entries(reactiveState.hooks)) {
      const name = `on${n.charAt(0).toUpperCase() + n.slice(1)}`
      hooksOn[name] = h.on
    }

    const emits = <any>{}
    for (const [n, h] of Object.entries(reactiveState.hooks)) {
      emits[n] = h.trigger
    }

    // for lookup purposes
    const nodeIds = computed(() => reactiveState.nodes.map((n) => n.id))
    const edgeIds = computed(() => reactiveState.edges.map((e) => e.id))

    const getters = useGetters(reactiveState, nodeIds, edgeIds)

    const actions = useActions(id, reactiveState, nodeIds, edgeIds)

    actions.setState({ ...reactiveState, ...preloadedState })

    const flow: VueFlowStore = {
      ...hooksOn,
      ...getters,
      ...actions,
      ...toRefs(reactiveState),
      emits,
      id,
      vueFlowVersion: typeof __VUE_FLOW_VERSION__ !== 'undefined' ? __VUE_FLOW_VERSION__ : 'UNKNOWN',
      $destroy: () => {
        this.remove(id)
      },
    }

    this.set(id, flow)

    return flow
  }

  public getId() {
    return `vue-flow-${this.currentId++}`
  }
}

type Injection = VueFlowStore | null | undefined
type Scope = (EffectScope & { vueFlowId: string }) | undefined

// todo: maybe replace the storage with a context based solution; This would break calling useVueFlow outside a setup function though, which should be fine
/**
 * Composable that provides access to a store instance
 *
 * If no id is provided, the store instance is injected from context
 *
 * If no store instance is found in context, a new store instance is created and registered in storage
 *
 * @public
 * @returns a vue flow store instance
 */
export function useVueFlow(options?: FlowProps): VueFlowStore {
  const storage = Storage.getInstance()

  const scope = getCurrentScope() as Scope

  const id = options?.id
  const vueFlowId = scope?.vueFlowId || id

  let vueFlow: Injection

  /**
   * check if we can get a store instance through injections
   * this should be the regular way after initialization
   */
  if (scope) {
    const injection = inject(VueFlow, null)
    if (typeof injection !== 'undefined' && injection !== null) {
      vueFlow = injection
    }
  }

  /**
   * check if we can get a store instance through storage
   * this requires options id or an id on the current scope
   */
  if (!vueFlow) {
    if (vueFlowId) {
      vueFlow = storage.get(vueFlowId)
    }
  }

  /**
   * If we cannot find any store instance in the previous steps
   * _or_ if the store instance we found does not match up with provided ids
   * create a new store instance and register it in storage
   */
  if (!vueFlow || (vueFlow && id && id !== vueFlow.id)) {
    const name = id ?? storage.getId()

    const state = storage.create(name, options)

    vueFlow = state

    effectScope().run(() => {
      /**
       * We have to watch the applyDefault option here,
       * because we need to register the default hooks before the `VueFlow` component is actually mounted and props passed
       * Otherwise calling `addNodes` while the component is not mounted will not trigger any changes unless change handlers are explicitly bound
       */
      watch(
        state.applyDefault,
        (shouldApplyDefault, __, onCleanup) => {
          const nodesChangeHandler = (changes: NodeChange[]) => {
            state.applyNodeChanges(changes)
          }

          const edgesChangeHandler = (changes: EdgeChange[]) => {
            state.applyEdgeChanges(changes)
          }

          if (shouldApplyDefault) {
            state.onNodesChange(nodesChangeHandler)
            state.onEdgesChange(edgesChangeHandler)
          } else {
            state.hooks.value.nodesChange.off(nodesChangeHandler)
            state.hooks.value.edgesChange.off(edgesChangeHandler)
          }

          // Release handlers on cleanup
          onCleanup(() => {
            state.hooks.value.nodesChange.off(nodesChangeHandler)
            state.hooks.value.edgesChange.off(edgesChangeHandler)
          })
        },
        { immediate: true },
      )

      // Destroy store instance on scope dispose
      tryOnScopeDispose(() => {
        if (vueFlow) {
          const storedInstance = storage.get(vueFlow.id)

          if (storedInstance) {
            storedInstance.$destroy()
          } else {
            warn(`No store instance found for id ${vueFlow.id} in storage.`)
          }
        }
      })
    })
  } else {
    // If options were passed, overwrite state with the options' values
    if (options) {
      vueFlow.setState(options)
    }
  }

  // Provide a fresh instance into context if we are in a scope
  if (scope) {
    provide(VueFlow, vueFlow)

    scope.vueFlowId = vueFlow.id
  }

  return vueFlow
}
