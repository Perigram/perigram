import { definePreset } from '@primeuix/themes'
import Lara from '@primeuix/themes/lara'

const Re_L = definePreset(Lara, {
    // Define semantic tokens with color schemes
    semantic: {
        // colorScheme: {
        //   light: {
        //     surface: {
        //       0: '{zinc.50}',
        //       50: '{zinc.100}',
        //       100: '{zinc.200}',
        //     },
        //     primary: {
        //       color: '{indigo.600}',
        //       hover: '{indigo.700}',
        //     },
        //   },
        //   dark: {
        //     surface: {
        //       0: '{zinc.950}',
        //       50: '{zinc.900}',
        //       100: '{zinc.800}',
        //     },
        //     primary: {
        //       color: '{indigo.400}',
        //       hover: '{indigo.500}',
        //     },
        //   }
        // }
    },
    // Define component-specific tokens
    components: {
        dataview: {
            root: {
                background: 'transparent',
                borderWidth: '0',
            },
            content: {
                background: 'transparent',
                borderWidth: '0',
            },
            header: {
                background: 'transparent',
                borderWidth: '0',
            },
        },
    },
})

export default Re_L
