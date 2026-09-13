import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'
import { primeComponentTokens, primeSemanticTokens } from '../tokens/index.js'

const Re_L = definePreset(Aura, {
    semantic: primeSemanticTokens,
    components: primeComponentTokens
})

export default Re_L
