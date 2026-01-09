const RECT_SUBGRAPH_ID = 'd8963104-a40a-4faf-9762-4dc76607da7d'
const GROW_SUBGRAPH_ID = '65f3238f-d937-45ce-bbee-494fc860ba3b'

export function buildNodiGraph(cassetteData, templateGraph) {
    const graph = {
        nodes: {},
        sub_graphs: JSON.parse(JSON.stringify(templateGraph.graph.sub_graphs)),
    }

    // Reset instances
    for (const sgId in graph.sub_graphs) {
        graph.sub_graphs[sgId].instances = []
    }

    const genId = () => crypto.randomUUID()

    // 1. Create Parameters (Number nodes)
    const paramNodes = {}
    const paramsToCreate = {
        A: cassetteData.params.A || 600,
        B: cassetteData.params.B || 600
    }

    for (const [key, value] of Object.entries(paramsToCreate)) {
        const id = genId()
        const outId = genId()
        const inValueId = genId()
        const inIntId = genId()
        
        graph.nodes[id] = {
            id,
            name: 'Number',
            label: key,
            input: {
                parameters: [
                    { id: inValueId, name: 'value', access_type: 'Item', hint: 'Number | Bool | String', connections: [] },
                    { id: inIntId, name: 'integer or not', access_type: 'Item', hint: 'Bool', connections: [] }
                ]
            },
            output: {
                parameters: [{
                    id: outId,
                    name: 'output value',
                    access_type: 'Item',
                    hint: 'Number',
                    connections: []
                }]
            },
            entity: {
                variant: 'Number',
                data: { value: parseFloat(value), integer: true, precision: 10 }
            },
            enabled: true,
            visible: true
        }
        paramNodes[key] = { id, outId }
    }

    // 2. Root Rectangle (Sub Graph)
    const rectInstanceId = genId()
    graph.sub_graphs[RECT_SUBGRAPH_ID].instances.push(rectInstanceId)

    const rectNodeId = genId()
    const rectIn0Id = genId()
    const rectIn1Id = genId()
    const rectOutId = genId()

    graph.nodes[rectNodeId] = {
        id: rectNodeId,
        name: 'Sub Graph',
        label: 'Root Face',
        input: {
            parameters: [
                { id: rectIn0Id, name: '0th target', access_type: 'Tree', hint: '', connections: [paramNodes.A.outId] },
                { id: rectIn1Id, name: '1th target', access_type: 'Tree', hint: '', connections: [paramNodes.B.outId] }
            ]
        },
        output: {
            parameters: [{ id: rectOutId, name: '0th output', access_type: 'Tree', hint: '', connections: [] }]
        },
        entity: { variant: 'SubGraph', data: { instance_id: rectInstanceId } },
        enabled: true,
        visible: true
    }

    graph.nodes[paramNodes.A.id].output.parameters[0].connections.push(rectIn0Id)
    graph.nodes[paramNodes.B.id].output.parameters[0].connections.push(rectIn1Id)

    // 3. Extrusions (linear chain)
    let currentUnionOutId = rectOutId
    let currentUnionNodeId = rectNodeId
    const extrusionOutputIds = []

    if (cassetteData.extrusions) {
        for (const ext of cassetteData.extrusions) {
            const growInstanceId = genId()
            graph.sub_graphs[GROW_SUBGRAPH_ID].instances.push(growInstanceId)

            const growNodeId = genId()
            const growIn0Id = genId()
            const growIn1Id = genId()
            const growIn2Id = genId()
            const growOut0Id = genId()
            const growOut1Id = genId()

            // Edge index constant
            const edgeConstId = genId()
            const edgeConstOutId = genId()
            const edgeIn0Id = genId()
            const edgeIn1Id = genId()
            graph.nodes[edgeConstId] = {
                id: edgeConstId,
                name: 'Number',
                label: `Edge Index`,
                input: {
                    parameters: [
                        { id: edgeIn0Id, name: 'value', access_type: 'Item', hint: 'Number | Bool | String', connections: [] },
                        { id: edgeIn1Id, name: 'integer or not', access_type: 'Item', hint: 'Bool', connections: [] }
                    ]
                },
                output: { parameters: [{ id: edgeConstOutId, name: 'output value', access_type: 'Item', hint: 'Number', connections: [growIn1Id] }] },
                entity: { variant: 'Number', data: { value: ext.edge, integer: true, precision: 1 } },
                enabled: true, visible: false
            }

            // Length constant
            const lengthConstId = genId()
            const lengthConstOutId = genId()
            const lengthIn0Id = genId()
            const lengthIn1Id = genId()
            graph.nodes[lengthConstId] = {
                id: lengthConstId,
                name: 'Number',
                label: `Length`,
                input: {
                    parameters: [
                        { id: lengthIn0Id, name: 'value', access_type: 'Item', hint: 'Number | Bool | String', connections: [] },
                        { id: lengthIn1Id, name: 'integer or not', access_type: 'Item', hint: 'Bool', connections: [] }
                    ]
                },
                output: { parameters: [{ id: lengthConstOutId, name: 'output value', access_type: 'Item', hint: 'Number', connections: [growIn2Id] }] },
                entity: { variant: 'Number', data: { value: parseFloat(ext.length), integer: true, precision: 10 } },
                enabled: true, visible: false
            }

            graph.nodes[growNodeId] = {
                id: growNodeId,
                name: 'Sub Graph',
                label: 'Grow Face',
                input: {
                    parameters: [
                        { id: growIn0Id, name: '0th target', access_type: 'Tree', hint: '', connections: [currentUnionOutId] },
                        { id: growIn1Id, name: '1th target', access_type: 'Tree', hint: '', connections: [edgeConstOutId] },
                        { id: growIn2Id, name: '2th target', access_type: 'Tree', hint: '', connections: [lengthConstOutId] }
                    ]
                },
                output: {
                    parameters: [
                        { id: growOut0Id, name: '0th output', access_type: 'Tree', hint: '', connections: [] },
                        { id: growOut1Id, name: '1th output', access_type: 'Tree', hint: '', connections: [] }
                    ]
                },
                entity: { variant: 'SubGraph', data: { instance_id: growInstanceId } },
                enabled: true, visible: true
            }

            // Connect previous union to this grow node
            const prevNode = graph.nodes[currentUnionNodeId]
            const prevOut = prevNode.output.parameters.find(p => p.id === currentUnionOutId)
            prevOut.connections.push(growIn0Id)

            currentUnionOutId = growOut0Id
            currentUnionNodeId = growNodeId
            extrusionOutputIds.push(growOut1Id)
        }
    }

    // 4. Final Boundary Surfaces
    const boundaryId = genId()
    const boundaryInId = genId()
    const boundaryOutId = genId()

    graph.nodes[boundaryId] = {
        id: boundaryId,
        name: 'Boundary Surfaces',
        label: '',
        input: {
            parameters: [{ id: boundaryInId, name: 'boundary curves', access_type: 'List', hint: 'Curve', connections: [currentUnionOutId] }]
        },
        output: {
            parameters: [{ id: boundaryOutId, name: 'boundary surfaces', access_type: 'List', hint: 'Surface', connections: [] }]
        },
        entity: { variant: 'BoundarySurfaces', data: {} },
        enabled: true, visible: true
    }

        const lastNode = graph.nodes[currentUnionNodeId]

        const lastOut = lastNode.output.parameters.find(p => p.id === currentUnionOutId)

        lastOut.connections.push(boundaryInId)

    

        return {

            graph,

            extrusionOutputIds

        }

    }

    