function createCassetteId() {
    const cryptoApi = globalThis.crypto
    if (cryptoApi?.randomUUID) return cryptoApi.randomUUID()

    if (cryptoApi?.getRandomValues) {
        const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
        bytes[6] = (bytes[6] & 0x0f) | 0x40
        bytes[8] = (bytes[8] & 0x3f) | 0x80
        const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0'))
        return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
    }

    return `cassette-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

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
                B: 600,
            },
            root: {
                id: createCassetteId(),
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

    addNode(parentId, edge, kind = 'return_flange') {
        const parent = this.findNode(parentId)
        if (!parent) return null

        let depthParam = ''
        let defaultValue = 0

        if (kind === 'face') {
            const usedLetters = Object.keys(this.data.params).filter(k => /^[C-Z]$/.test(k)).sort()
            const lastLetter = usedLetters.length ? usedLetters[usedLetters.length - 1] : 'B'
            depthParam = String.fromCharCode(lastLetter.charCodeAt(0) + 1)
            defaultValue = 600
        } else {
            const usedR = Object.keys(this.data.params).filter(k => /^R\d+$/.test(k))
            const lastNum = usedR.length ? Math.max(...usedR.map(k => parseInt(k.substring(1)))) : 0
            depthParam = `R${lastNum + 1}`
            defaultValue = 30
        }

        if (!this.data.params[depthParam]) {
            this.data.params[depthParam] = defaultValue
        }

        const newNode = {
            id: createCassetteId(),
            kind,
            depth: depthParam,
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
