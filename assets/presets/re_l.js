import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

const Re_L = definePreset(Aura, {
    components: {
        dataview: {
            root: {
                background: 'transparent',
                borderWidth: '0'
            },
            content: {
                background: 'transparent',
                borderWidth: '0'
            },
            header: {
                background: 'transparent',
                borderWidth: '0'
            }
        }
    }
})

export default Re_L
