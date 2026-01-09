export class Cassette {
    constructor(data = null) {
        this.data = data || {
            meta: {
                units: 'mm',
                thickness: 2,
                bendRadius: 2,
            },
            params: {
                A: 600,
                B: 400,
            },
            root: {
                id: crypto.randomUUID(),
                kind: 'face',
                depth: 'B',
                children: {},
            },
        }
    }

    static fromJSON(json) {
        return new Cassette(JSON.parse(json))
    }

    toJSON() {
        return JSON.stringify(this.data)
    }

    findNode(id, parent = this.data.root) {
        if (parent.id === id) return parent
        for (const edge in parent.children) {
            const found = this.findNode(id, parent.children[edge])
            if (found) return found
        }
        return null
    }

    addNode(parentId, edge, kind = 'return_flange', depth = '100') {
        const parent = this.findNode(parentId)
        if (!parent) return null

        const newNode = {
            id: crypto.randomUUID(),
            kind,
            depth: depth.toString(),
            attach: {
                bendAngle: 90,
            },
            children: {},
        }

        parent.children[edge] = newNode
        return newNode
    }

    removeNode(id) {
        if (this.data.root.id === id) return false
        return this._removeNodeRecursive(id, this.data.root)
    }

    _removeNodeRecursive(id, parent) {
        for (const edge in parent.children) {
            if (parent.children[edge].id === id) {
                delete parent.children[edge]
                return true
            }
            if (this._removeNodeRecursive(id, parent.children[edge])) return true
        }
        return false
    }

    updateNode(id, update) {
        const node = this.findNode(id)
        if (!node) return false
        Object.assign(node, update)
        return true
    }

    getFlatList() {
        const list = []
        const traverse = (node, parentId = null, edge = null) => {
            list.push({ node, parentId, edge })
            for (const e in node.children) {
                traverse(node.children[e], node.id, e)
            }
        }
        traverse(this.data.root)
        return list
    }
}
