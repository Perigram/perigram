import { definePreset } from '@primeuix/themes'
import Lara from '@primeuix/themes/lara'

const Re_L = definePreset(Lara, {
    semantic: {
        colorScheme: {
            light: {
                // Surface colors - clean whites and light grays
                surface: {
                    0: '#ffffff',
                    50: '#f9fafb',
                    100: '#f3f4f6',
                    200: '#e5e7eb',
                    300: '#d1d5db',
                    400: '#9ca3af',
                    500: '#6b7280',
                    600: '#4b5563',
                    700: '#374151',
                    800: '#1f2937',
                    900: '#111827',
                    950: '#030712',
                },
                // Primary - modern blue
                primary: {
                    50: '#eff6ff',
                    100: '#dbeafe',
                    200: '#bfdbfe',
                    300: '#93c5fd',
                    400: '#60a5fa',
                    500: '#3b82f6',
                    600: '#2563eb',
                    700: '#1d4ed8',
                    800: '#1e40af',
                    900: '#1e3a8a',
                    950: '#172554',
                },
            },
            dark: {
                // Surface colors - deep dark with subtle variations
                surface: {
                    0: '#0a0a0a',
                    50: '#171717',
                    100: '#262626',
                    200: '#404040',
                    300: '#525252',
                    400: '#737373',
                    500: '#a3a3a3',
                    600: '#d4d4d4',
                    700: '#e5e5e5',
                    800: '#f5f5f5',
                    900: '#fafafa',
                    950: '#ffffff',
                },
                // Primary - lighter blue for dark mode
                primary: {
                    50: '#172554',
                    100: '#1e3a8a',
                    200: '#1e40af',
                    300: '#1d4ed8',
                    400: '#2563eb',
                    500: '#3b82f6',
                    600: '#60a5fa',
                    700: '#93c5fd',
                    800: '#bfdbfe',
                    900: '#dbeafe',
                    950: '#eff6ff',
                },
            }
        }
    },
    components: {
        // Accordion - minimal borders
        accordion: {
            panel: {
                borderWidth: '0 0 1px 0',
            },
        },
        
        // Button - clean and modern
        button: {
            root: {
                borderRadius: '{border.radius.md}',
            },
            colorScheme: {
                light: {
                    primary: {
                        background: '{primary.600}',
                        hoverBackground: '{primary.700}',
                        activeBackground: '{primary.800}',
                    },
                    secondary: {
                        background: '{surface.100}',
                        hoverBackground: '{surface.200}',
                        color: '{surface.700}',
                    },
                },
                dark: {
                    primary: {
                        background: '{primary.500}',
                        hoverBackground: '{primary.600}',
                        activeBackground: '{primary.700}',
                    },
                    secondary: {
                        background: '{surface.100}',
                        hoverBackground: '{surface.200}',
                        color: '{surface.900}',
                    },
                },
            },
        },
        
        // Card - subtle borders, no shadow
        card: {
            root: {
                background: '{surface.0}',
                borderRadius: '{border.radius.lg}',
                borderWidth: '1px',
                borderColor: '{surface.200}',
                boxShadow: 'none',
            },
            colorScheme: {
                dark: {
                    root: {
                        background: '{surface.50}',
                        borderColor: '{surface.200}',
                    },
                },
            },
        },
        
        // DataTable - clean and spacious
        datatable: {
            root: {
                borderWidth: '1px 0 0 0',
            },
            header: {
                background: '{surface.0}',
                borderWidth: '0 0 1px 0',
            },
            bodyRow: {
                background: '{surface.0}',
                hoverBackground: '{surface.50}',
            },
            colorScheme: {
                dark: {
                    header: {
                        background: '{surface.0}',
                    },
                    bodyRow: {
                        background: '{surface.0}',
                        hoverBackground: '{surface.100}',
                    },
                },
            },
        },
        
        // DataView - transparent
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
        
        // Dialog - modern modal
        dialog: {
            root: {
                borderRadius: '{border.radius.xl}',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            },
        },
        
        // Dropdown/Select - clean input style
        select: {
            root: {
                borderRadius: '{border.radius.md}',
            },
            overlay: {
                borderRadius: '{border.radius.md}',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            },
        },
        
        // InputText - consistent with other inputs
        inputtext: {
            root: {
                borderRadius: '{border.radius.md}',
            },
        },
        
        // InputNumber - matches InputText
        inputnumber: {
            root: {
                borderRadius: '{border.radius.md}',
            },
        },
        
        // Message - subtle alerts
        message: {
            root: {
                borderRadius: '{border.radius.lg}',
                borderWidth: '1px',
            },
        },
        
        // TabView - clean tabs
        tabview: {
            nav: {
                background: '{surface.0}',
                borderWidth: '0 0 1px 0',
            },
            navItem: {
                background: 'transparent',
                hoverBackground: '{surface.50}',
                activeBackground: 'transparent',
            },
            colorScheme: {
                dark: {
                    nav: {
                        background: '{surface.0}',
                    },
                    navItem: {
                        hoverBackground: '{surface.100}',
                    },
                },
            },
        },
        
        // Tag - minimal badges
        tag: {
            root: {
                borderRadius: '{border.radius.sm}',
                fontSize: '0.75rem',
                fontWeight: '500',
            },
        },
        
        // ConfirmDialog - matches Dialog
        confirmdialog: {
            root: {
                borderRadius: '{border.radius.xl}',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            },
        },
        
        // Avatar - clean circles
        avatar: {
            root: {
                borderRadius: '{border.radius.full}',
            },
        },
        
        // Menubar - sticky header style
        menubar: {
            root: {
                background: '{surface.0}',
                borderWidth: '0 0 1px 0',
                borderRadius: '0',
            },
            colorScheme: {
                dark: {
                    root: {
                        background: '{surface.0}',
                    },
                },
            },
        },
    },
})

export default Re_L
