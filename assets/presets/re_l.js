import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'
import { primeComponentTokens } from '../tokens/index.js'

const Re_L = definePreset(Aura, {
    components: primeComponentTokens
})

export default Re_L
