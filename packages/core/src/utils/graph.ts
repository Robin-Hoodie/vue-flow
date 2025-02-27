import { markRaw } from 'vue'
import type {
  Actions,
  Box,
  Connection,
  CoordinateExtent,
  DefaultEdgeOptions,
  Dimensions,
  Edge,
  EdgeMarkerType,
  Element,
  ElementData,
  Elements,
  FlowElements,
  GraphEdge,
  GraphNode,
  MaybeElement,
  Node,
  Rect,
  ViewportTransform,
  XYPosition,
  XYZPosition,
} from '../types'
import { useWindow } from '../composables'
import { isDef, warn } from '.'

export function nodeToRect(node: GraphNode): Rect {
  return {
    ...(node.computedPosition || { x: 0, y: 0 }),
    width: node.dimensions.width || 0,
    height: node.dimensions.height || 0,
  }
}

export function getOverlappingArea(rectA: Rect, rectB: Rect) {
  const xOverlap = Math.max(0, Math.min(rectA.x + rectA.width, rectB.x + rectB.width) - Math.max(rectA.x, rectB.x))
  const yOverlap = Math.max(0, Math.min(rectA.y + rectA.height, rectB.y + rectB.height) - Math.max(rectA.y, rectB.y))

  return Math.ceil(xOverlap * yOverlap)
}

export function getDimensions(node: HTMLElement): Dimensions {
  return {
    width: node.offsetWidth,
    height: node.offsetHeight,
  }
}

export function clamp(val: number, min = 0, max = 1) {
  return Math.min(Math.max(val, min), max)
}

export function clampPosition(position: XYPosition, extent: CoordinateExtent): XYPosition {
  return {
    x: clamp(position.x, extent[0][0], extent[1][0]),
    y: clamp(position.y, extent[0][1], extent[1][1]),
  }
}

export function getHostForElement(element: HTMLElement): Document {
  const doc = element.getRootNode() as Document

  if ('elementFromPoint' in doc) {
    return doc
  }

  const window = useWindow()

  return window.document
}

// todo: refactor generic to use MaybeElement
export function isEdge<Data = ElementData>(element: MaybeElement): element is Edge<Data> {
  return element && typeof element === 'object' && 'id' in element && 'source' in element && 'target' in element
}

// todo: refactor generic to use MaybeElement
export function isGraphEdge<Data = ElementData>(element: MaybeElement): element is GraphEdge<Data> {
  return isEdge(element) && 'sourceNode' in element && 'targetNode' in element
}

// todo: refactor generic to use MaybeElement
export function isNode<Data = ElementData>(element: MaybeElement): element is Node<Data> {
  return element && typeof element === 'object' && 'id' in element && 'position' in element && !isEdge(element)
}

// todo: refactor generic to use MaybeElement
export function isGraphNode<Data = ElementData>(element: MaybeElement): element is GraphNode<Data> {
  return isNode(element) && 'computedPosition' in element
}

function isNumeric(n: any): n is number {
  return !Number.isNaN(n) && Number.isFinite(n)
}

export function isRect(obj: any): obj is Rect {
  return isNumeric(obj.width) && isNumeric(obj.height) && isNumeric(obj.x) && isNumeric(obj.y)
}

export function parseNode(node: Node, existingNode?: GraphNode, parentNode?: string): GraphNode {
  const initialState = {
    id: node.id.toString(),
    type: node.type ?? 'default',
    dimensions: markRaw({
      width: 0,
      height: 0,
    }),
    handleBounds: {
      source: [],
      target: [],
    },
    computedPosition: markRaw({
      z: 0,
      ...node.position,
    }),
    draggable: undefined,
    selectable: undefined,
    connectable: undefined,
    focusable: undefined,
    selected: false,
    dragging: false,
    resizing: false,
    initialized: false,
    isParent: false,
    position: {
      x: 0,
      y: 0,
    },
    data: isDef(node.data) ? node.data : {},
    events: markRaw(isDef(node.events) ? node.events : {}),
  } as GraphNode

  return Object.assign(existingNode ?? initialState, node, { id: node.id.toString(), parentNode }) as GraphNode
}

export function parseEdge(edge: Edge, existingEdge?: GraphEdge, defaultEdgeOptions?: DefaultEdgeOptions): GraphEdge {
  const initialState = {
    id: edge.id.toString(),
    type: edge.type ?? existingEdge?.type ?? 'default',
    source: edge.source.toString(),
    target: edge.target.toString(),
    sourceHandle: edge.sourceHandle?.toString(),
    targetHandle: edge.targetHandle?.toString(),
    updatable: edge.updatable ?? defaultEdgeOptions?.updatable,
    selectable: edge.selectable ?? defaultEdgeOptions?.selectable,
    focusable: edge.focusable ?? defaultEdgeOptions?.focusable,
    data: isDef(edge.data) ? edge.data : {},
    events: markRaw(isDef(edge.events) ? edge.events : {}),
    label: edge.label ?? '',
    interactionWidth: edge.interactionWidth ?? defaultEdgeOptions?.interactionWidth,
    ...(defaultEdgeOptions ?? {}),
  } as GraphEdge

  return Object.assign(existingEdge ?? initialState, edge, { id: edge.id.toString() }) as GraphEdge
}

function getConnectedElements<T extends Node = Node>(
  nodeOrId: Node | { id: string } | string,
  nodes: T[],
  edges: Edge[],
  dir: 'source' | 'target',
): T[] {
  const id = typeof nodeOrId === 'string' ? nodeOrId : nodeOrId.id

  const connectedIds = new Set()

  const origin = dir === 'source' ? 'target' : 'source'

  for (const edge of edges) {
    if (edge[origin] === id) {
      connectedIds.add(edge[dir])
    }
  }

  return nodes.filter((n) => connectedIds.has(n.id))
}

export function getOutgoers<N extends Node>(nodeOrId: Node | { id: string } | string, nodes: N[], edges: Edge[]): N[]
export function getOutgoers<T extends Elements>(
  nodeOrId: Node | { id: string } | string,
  elements: T,
): T extends FlowElements ? GraphNode[] : Node[]
export function getOutgoers(...args: any[]) {
  if (args.length === 3) {
    const [nodeOrId, nodes, edges] = args
    return getConnectedElements(nodeOrId, nodes, edges, 'target')
  }

  const [nodeOrId, elements] = args
  const nodeId = typeof nodeOrId === 'string' ? nodeOrId : nodeOrId.id

  const outgoers = elements.filter((el: Element) => isEdge(el) && el.source === nodeId)

  return outgoers.map((edge: Edge) => elements.find((el: Element) => isNode(el) && el.id === edge.target))
}

export function getIncomers<N extends Node>(nodeOrId: Node | { id: string } | string, nodes: N[], edges: Edge[]): N[]
export function getIncomers<T extends Elements>(
  nodeOrId: Node | { id: string } | string,
  elements: T,
): T extends FlowElements ? GraphNode[] : Node[]
export function getIncomers(...args: any[]) {
  if (args.length === 3) {
    const [nodeOrId, nodes, edges] = args
    return getConnectedElements(nodeOrId, nodes, edges, 'source')
  }

  const [nodeOrId, elements] = args
  const nodeId = typeof nodeOrId === 'string' ? nodeOrId : nodeOrId.id

  const incomers = elements.filter((el: Element) => isEdge(el) && el.target === nodeId)

  return incomers.map((edge: Edge) => elements.find((el: Element) => isNode(el) && el.id === edge.source))
}

export function getEdgeId({ source, sourceHandle, target, targetHandle }: Connection) {
  return `vueflow__edge-${source}${sourceHandle ?? ''}-${target}${targetHandle ?? ''}`
}

export function connectionExists(edge: Edge | Connection, elements: Elements) {
  return elements.some(
    (el) =>
      isEdge(el) &&
      el.source === edge.source &&
      el.target === edge.target &&
      (el.sourceHandle === edge.sourceHandle || (!el.sourceHandle && !edge.sourceHandle)) &&
      (el.targetHandle === edge.targetHandle || (!el.targetHandle && !edge.targetHandle)),
  )
}

/**
 * @deprecated Use store instance and call `addEdges` with template-ref or the one received by `onPaneReady` instead
 *
 * Intended for options API
 * In composition API you can access utilities from `useVueFlow`
 */
export function addEdge(edgeParams: Edge | Connection, elements: Elements, defaults?: DefaultEdgeOptions) {
  if (!edgeParams.source || !edgeParams.target) {
    warn("Can't create edge. An edge needs a source and a target.")
    return elements
  }

  let edge

  if (isEdge(edgeParams)) {
    edge = { ...edgeParams }
  } else {
    edge = {
      ...edgeParams,
      id: getEdgeId(edgeParams),
    } as Edge
  }

  edge = parseEdge(edge, undefined, defaults)

  if (connectionExists(edge, elements)) {
    return elements
  }

  elements.push(edge)

  return elements
}

/**
 * @deprecated Use store instance and call `updateEdge` with template-ref or the one received by `onPaneReady` instead
 *
 * Intended for options API
 * In composition API you can access utilities from `useVueFlow`
 */
export function updateEdge(oldEdge: Edge, newConnection: Connection, elements: Elements) {
  if (!newConnection.source || !newConnection.target) {
    warn("Can't create new edge. An edge needs a source and a target.")
    return elements
  }

  const foundEdge = elements.find((e) => isEdge(e) && e.id === oldEdge.id)

  if (!foundEdge) {
    warn(`The old edge with id=${oldEdge.id} does not exist.`)
    return elements
  }

  // Remove old edge and create the new edge with parameters of old edge.
  const edge: Edge = {
    ...oldEdge,
    id: getEdgeId(newConnection),
    source: newConnection.source,
    target: newConnection.target,
    sourceHandle: newConnection.sourceHandle,
    targetHandle: newConnection.targetHandle,
  }
  elements.splice(elements.indexOf(foundEdge), 1, edge)

  return elements.filter((e) => e.id !== oldEdge.id)
}

export function rendererPointToPoint({ x, y }: XYPosition, { x: tx, y: ty, zoom: tScale }: ViewportTransform): XYPosition {
  return {
    x: x * tScale + tx,
    y: y * tScale + ty,
  }
}
export function pointToRendererPoint(
  { x, y }: XYPosition,
  { x: tx, y: ty, zoom: tScale }: ViewportTransform,
  snapToGrid: boolean,
  [snapX, snapY]: [snapX: number, snapY: number],
): XYPosition {
  const position: XYPosition = {
    x: (x - tx) / tScale,
    y: (y - ty) / tScale,
  }

  if (snapToGrid) {
    return {
      x: snapX * Math.round(position.x / snapX),
      y: snapY * Math.round(position.y / snapY),
    }
  }

  return position
}

function getBoundsOfBoxes(box1: Box, box2: Box): Box {
  return {
    x: Math.min(box1.x, box2.x),
    y: Math.min(box1.y, box2.y),
    x2: Math.max(box1.x2, box2.x2),
    y2: Math.max(box1.y2, box2.y2),
  }
}

export function rectToBox({ x, y, width, height }: Rect): Box {
  return {
    x,
    y,
    x2: x + width,
    y2: y + height,
  }
}

export function boxToRect({ x, y, x2, y2 }: Box): Rect {
  return {
    x,
    y,
    width: x2 - x,
    height: y2 - y,
  }
}

// todo: fix typo
export function getBoundsofRects(rect1: Rect, rect2: Rect) {
  return boxToRect(getBoundsOfBoxes(rectToBox(rect1), rectToBox(rect2)))
}

export function getRectOfNodes(nodes: GraphNode[]) {
  const box = nodes.reduce(
    (currBox, { computedPosition = { x: 0, y: 0 }, dimensions = { width: 0, height: 0 } } = {} as any) =>
      getBoundsOfBoxes(
        currBox,
        rectToBox({
          ...computedPosition,
          ...dimensions,
        } as Rect),
      ),
    { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY, x2: Number.NEGATIVE_INFINITY, y2: Number.NEGATIVE_INFINITY },
  )

  return boxToRect(box)
}

export function getNodesInside(
  nodes: GraphNode[],
  rect: Rect,
  { x: tx, y: ty, zoom: tScale }: ViewportTransform = { x: 0, y: 0, zoom: 1 },
  partially = false,
  // set excludeNonSelectableNodes if you want to pay attention to the nodes "selectable" attribute
  excludeNonSelectableNodes = false,
) {
  const paneRect = {
    x: (rect.x - tx) / tScale,
    y: (rect.y - ty) / tScale,
    width: rect.width / tScale,
    height: rect.height / tScale,
  }

  return nodes.filter((node) => {
    const { computedPosition = { x: 0, y: 0 }, dimensions = { width: 0, height: 0 }, selectable } = node

    if (excludeNonSelectableNodes && !selectable) {
      return false
    }

    const nodeRect = { ...computedPosition, width: dimensions.width || 0, height: dimensions.height || 0 }
    const overlappingArea = getOverlappingArea(paneRect, nodeRect)
    const notInitialized =
      typeof dimensions.width === 'undefined' ||
      typeof dimensions.height === 'undefined' ||
      dimensions.width === 0 ||
      dimensions.height === 0

    const partiallyVisible = partially && overlappingArea > 0
    const area = dimensions.width * dimensions.height
    return notInitialized || partiallyVisible || overlappingArea >= area
  })
}

export function getConnectedEdges<E extends Edge>(nodesOrId: Node[] | string, edges: E[]) {
  const nodeIds = new Set()

  if (typeof nodesOrId === 'string') {
    nodeIds.add(nodesOrId)
  } else if (nodesOrId.length >= 1) {
    for (const n of nodesOrId) {
      nodeIds.add(n.id)
    }
  }

  return edges.filter((edge) => nodeIds.has(edge.source) || nodeIds.has(edge.target))
}

export function getConnectedNodes<N extends Node | { id: string } | string>(nodes: N[], edges: Edge[]) {
  const nodeIds = new Set()

  for (const node of nodes) {
    nodeIds.add(typeof node === 'string' ? node : node.id)
  }

  const connectedNodeIds = edges.reduce((acc, edge) => {
    if (nodeIds.has(edge.source)) {
      acc.add(edge.target)
    }

    if (nodeIds.has(edge.target)) {
      acc.add(edge.source)
    }

    return acc
  }, new Set())

  return nodes.filter((node) => connectedNodeIds.has(typeof node === 'string' ? node : node.id))
}

export function getTransformForBounds(
  bounds: Rect,
  width: number,
  height: number,
  minZoom: number,
  maxZoom: number,
  padding = 0.1,
  offset: {
    x?: number
    y?: number
  } = { x: 0, y: 0 },
): ViewportTransform {
  const xZoom = width / (bounds.width * (1 + padding))
  const yZoom = height / (bounds.height * (1 + padding))
  const zoom = Math.min(xZoom, yZoom)
  const clampedZoom = clamp(zoom, minZoom, maxZoom)
  const boundsCenterX = bounds.x + bounds.width / 2
  const boundsCenterY = bounds.y + bounds.height / 2
  const x = width / 2 - boundsCenterX * clampedZoom + (offset.x ?? 0)
  const y = height / 2 - boundsCenterY * clampedZoom + (offset.y ?? 0)

  return { x, y, zoom: clampedZoom }
}

export function getXYZPos(parentPos: XYZPosition, computedPosition: XYZPosition): XYZPosition {
  return {
    x: computedPosition.x + parentPos.x,
    y: computedPosition.y + parentPos.y,
    z: (parentPos.z > computedPosition.z ? parentPos.z : computedPosition.z) + 1,
  }
}

export function isParentSelected(node: GraphNode, findNode: Actions['findNode']): boolean {
  if (!node.parentNode) {
    return false
  }

  const parent = findNode(node.parentNode)
  if (!parent) {
    return false
  }

  if (parent.selected) {
    return true
  }

  return isParentSelected(parent, findNode)
}

export function getMarkerId(marker: EdgeMarkerType | undefined, vueFlowId?: string) {
  if (typeof marker === 'undefined') {
    return ''
  }

  if (typeof marker === 'string') {
    return marker
  }

  const idPrefix = vueFlowId ? `${vueFlowId}__` : ''

  return `${idPrefix}${Object.keys(marker)
    .sort()
    .map((key) => `${key}=${marker[<keyof EdgeMarkerType>key]}`)
    .join('&')}`
}
