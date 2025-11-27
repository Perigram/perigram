import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

const Re_L = definePreset(Aura, {
//     semantic: {
//         colorScheme: {
//             light: {
//                 surface: {
//                     0: '#ffffff',
//                     50: 'zinc.50',
//                     100: 'zinc.100',
//                     200: 'zinc.200',
//                     300: 'zinc.300',
//                     400: 'zinc.400',
//                     500: 'zinc.500',
//                     600: 'zinc.600',
//                     700: 'zinc.700',
//                     800: 'zinc.800',
//                     900: 'zinc.900',
//                     950: 'zinc.950',
//                 },
//                 primary: {
//                     50: '#eff6ff',
//                     100: '#dbeafe',
//                     200: '#bfdbfe',
//                     300: '#93c5fd',
//                     400: '#60a5fa',
//                     500: '#3b82f6',
//                     600: '#2563eb',
//                     700: '#1d4ed8',
//                     800: '#1e40af',
//                     900: '#1e3a8a',
//                     950: '#172554',
//                 },
//             },
//             dark: {
//                 surface: {
//                     0: '#ffffff',
//                     50: 'zinc.950',
//                     100: 'zinc.900',
//                     200: 'zinc.800',
//                     300: 'zinc.700',
//                     400: 'zinc.600',
//                     500: 'zinc.500',
//                     600: 'zinc.400',
//                     700: 'zinc.300',
//                     800: 'zinc.200',
//                     900: 'zinc.100',
//                     950: 'zinc.50',
//                 },
//                 primary: {
//                     50: '#172554',
//                     100: '#1e3a8a',
//                     200: '#1e40af',
//                     300: '#1d4ed8',
//                     400: '#2563eb',
//                     500: '#3b82f6',
//                     600: '#60a5fa',
//                     700: '#93c5fd',
//                     800: '#bfdbfe',
//                     900: '#dbeafe',
//                     950: '#eff6ff',
//                 },
//             },
//         },
//     },
//     components: {
//         // Accordion - minimal borders
//         accordion: {
//             panel: {
//                 borderWidth: '0 0 1px 0',
//             },
//         },

//         // Button - clean and modern
//         // button: {
//         //     root: {
//         //         borderRadius: '{border.radius.md}',
//         //     },
//         //     colorScheme: {
//         //         light: {
//         //             primary: {
//         //                 background: '{primary.600}',
//         //                 hoverBackground: '{primary.700}',
//         //                 activeBackground: '{primary.800}',
//         //             },
//         //             secondary: {
//         //                 background: '{surface.100}',
//         //                 hoverBackground: '{surface.200}',
//         //                 color: '{surface.700}',
//         //             },
//         //         },
//         //         dark: {
//         //             primary: {
//         //                 background: '{primary.500}',
//         //                 hoverBackground: '{primary.600}',
//         //                 activeBackground: '{primary.700}',
//         //             },
//         //             secondary: {
//         //                 background: '{surface.100}',
//         //                 hoverBackground: '{surface.200}',
//         //                 color: '{surface.900}',
//         //             },
//         //         },
//         //     },
//         // },

//         card: {},

//         // DataTable - clean and spacious
//         datatable: {
//             root: {
//                 borderWidth: '1px 0 0 0',
//             },
//             header: {
//                 background: '{surface.0}',
//                 borderWidth: '0 0 1px 0',
//             },
//             bodyRow: {
//                 background: '{surface.0}',
//                 hoverBackground: '{surface.50}',
//             },
//             colorScheme: {
//                 dark: {
//                     header: {
//                         background: '{surface.0}',
//                     },
//                     bodyRow: {
//                         background: '{surface.0}',
//                         hoverBackground: '{surface.100}',
//                     },
//                 },
//                 light: {
//                     header: {
//                         background: '{surface.0}',
//                     },
//                     bodyRow: {
//                         background: '{surface.0}',
//                         hoverBackground: '{surface.50}',
//                     },
//                 },
//             },
//         },

//         // DataView - transparent
//         dataview: {
//             root: {
//                 background: 'transparent',
//                 borderWidth: '0',
//             },
//             content: {
//                 background: 'transparent',
//                 borderWidth: '0',
//             },
//             header: {
//                 background: 'transparent',
//                 borderWidth: '0',
//             },
//         },

//         // Dialog - modern modal
//         dialog: {
//             root: {
//                 borderRadius: '{border.radius.xl}',
//                 boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
//             },
//         },

//         // Dropdown/Select - clean input style
//         select: {
//             root: {
//                 borderRadius: '{border.radius.md}',
//             },
//             overlay: {
//                 borderRadius: '{border.radius.md}',
//                 boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
//             },
//         },

//         // InputText - consistent with other inputs
//         inputtext: {
//             root: {
//                 borderRadius: '{border.radius.md}',
//             },
//         },

//         // InputNumber - matches InputText
//         inputnumber: {
//             root: {
//                 borderRadius: '{border.radius.md}',
//             },
//         },

//         // Message - subtle alerts
//         message: {
//             root: {
//                 borderRadius: '{border.radius.lg}',
//                 borderWidth: '1px',
//             },
//         },

//         // TabView - clean tabs
//         tabview: {
//             nav: {
//                 background: '{surface.0}',
//                 borderWidth: '0 0 1px 0',
//             },
//             navItem: {
//                 background: 'transparent',
//                 hoverBackground: '{surface.50}',
//                 activeBackground: 'transparent',
//             },
//             colorScheme: {
//                 dark: {
//                     nav: {
//                         background: '{surface.0}',
//                     },
//                     navItem: {
//                         hoverBackground: '{surface.100}',
//                     },
//                 },
//                 light: {
//                     nav: {
//                         background: '{surface.0}',
//                     },
//                     navItem: {
//                         hoverBackground: '{surface.50}',
//                     },
//                 },
//             },
//         },

//         // Tag - minimal badges
//         tag: {
//             root: {
//                 borderRadius: '{border.radius.sm}',
//                 fontSize: '0.75rem',
//                 fontWeight: '500',
//             },
//         },

//         // ConfirmDialog - matches Dialog
//         confirmdialog: {
//             root: {
//                 borderRadius: '{border.radius.xl}',
//                 boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
//             },
//         },

//         // Avatar - clean circles
//         avatar: {
//             root: {
//                 borderRadius: '{border.radius.full}',
//             },
//         },

//         // Menubar - sticky header style
//         menubar: {
//             root: {
//                 background: '{surface.0}',
//                 borderWidth: '0 0 1px 0',
//                 borderRadius: '0',
//             },
//             colorScheme: {
//                 dark: {
//                     root: {
//                         background: '{surface.0}',
//                     },
//                 },
//                 light: {
//                     root: {
//                         background: '{surface.0}',
//                     },
//                 },
//             },
//         },
//     },
})

export default Re_L
