export const designTokens = {
    color: {
        primary: 'var(--p-primary-color)',
        primaryContrast: 'var(--p-primary-contrast-color)',
        primaryEmphasis: 'var(--p-primary-emphasis-color)',
        text: 'var(--p-text-color)',
        textMuted: 'var(--p-text-muted-color)',
        content: 'var(--p-content-background)',
        contentBorder: 'var(--p-content-border-color)',
        page: 'var(--ck-page-background)',
        chrome: 'var(--ck-chrome-background)',
        subtle: 'var(--ck-subtle-background)'
    },
    layout: {
        pageMaxWidth: '1600px',
        gridGap: '1.25rem',
        detailsGap: '1.5rem',
        dialogSm: '24rem',
        dialogMd: '42rem',
        dialogLg: '56rem',
        dialogXl: '72rem',
        supportChatWidth: '25rem',
        supportChatHeight: '31.25rem',
        supportChatAdminHeight: 'calc(100vh - 12rem)',
        supportChatMessageMax: '85%',
        supportChatAdminMessageMax: '80%',
        entityPopoverMinWidth: '18.75rem',
        swatchSize: '2.625rem',
        floatingMenuMinWidth: '12.5rem',
        previewDialogHeight: '95vh',
        tableActionColumnWidth: '3rem'
    },
    radius: {
        ui: '0.5rem',
        panel: '0.625rem',
        full: '9999px'
    },
    shadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.06), 0 1px 1px rgb(15 23 42 / 0.04)',
        cardHover: '0 10px 24px rgb(15 23 42 / 0.10), 0 2px 6px rgb(15 23 42 / 0.06)',
        overlay: '0 18px 48px rgb(15 23 42 / 0.18)'
    },
    motion: {
        fast: '120ms',
        normal: '200ms'
    }
};

export const cssVariableTokens = {
    '--ck-page-background': 'var(--p-surface-50)',
    '--ck-chrome-background': 'color-mix(in srgb, var(--p-content-background), transparent 6%)',
    '--ck-subtle-background': 'var(--p-surface-100)',
    '--ck-page-max-width': designTokens.layout.pageMaxWidth,
    '--ck-grid-gap': designTokens.layout.gridGap,
    '--ck-details-gap': designTokens.layout.detailsGap,
    '--ck-dialog-sm': designTokens.layout.dialogSm,
    '--ck-dialog-md': designTokens.layout.dialogMd,
    '--ck-dialog-lg': designTokens.layout.dialogLg,
    '--ck-dialog-xl': designTokens.layout.dialogXl,
    '--ck-support-chat-width': designTokens.layout.supportChatWidth,
    '--ck-support-chat-height': designTokens.layout.supportChatHeight,
    '--ck-support-chat-admin-height': designTokens.layout.supportChatAdminHeight,
    '--ck-support-chat-message-max': designTokens.layout.supportChatMessageMax,
    '--ck-support-chat-admin-message-max': designTokens.layout.supportChatAdminMessageMax,
    '--ck-entity-popover-min-width': designTokens.layout.entityPopoverMinWidth,
    '--ck-swatch-size': designTokens.layout.swatchSize,
    '--ck-floating-menu-min-width': designTokens.layout.floatingMenuMinWidth,
    '--ck-preview-dialog-height': designTokens.layout.previewDialogHeight,
    '--ck-table-action-column-width': designTokens.layout.tableActionColumnWidth,
    '--ck-radius-ui': designTokens.radius.ui,
    '--ck-radius-panel': designTokens.radius.panel,
    '--ck-shadow-card': designTokens.shadow.card,
    '--ck-shadow-card-hover': designTokens.shadow.cardHover,
    '--ck-shadow-overlay': designTokens.shadow.overlay,
    '--ck-motion-fast': designTokens.motion.fast,
    '--ck-motion-normal': designTokens.motion.normal
};

export const tailwindThemeExtension = {
    colors: {
        primary: designTokens.color.primary,
        'primary-contrast': designTokens.color.primaryContrast,
        'primary-emphasis': designTokens.color.primaryEmphasis,
        content: designTokens.color.content,
        'content-border': designTokens.color.contentBorder,
        page: designTokens.color.page,
        chrome: designTokens.color.chrome,
        subtle: designTokens.color.subtle,
        'text-muted': designTokens.color.textMuted,
        surface: {
            0: 'var(--p-surface-0)',
            50: 'var(--p-surface-50)',
            100: 'var(--p-surface-100)',
            200: 'var(--p-surface-200)',
            300: 'var(--p-surface-300)',
            400: 'var(--p-surface-400)',
            500: 'var(--p-surface-500)',
            600: 'var(--p-surface-600)',
            700: 'var(--p-surface-700)',
            800: 'var(--p-surface-800)',
            900: 'var(--p-surface-900)',
            950: 'var(--p-surface-950)'
        }
    },
    maxWidth: {
        app: 'var(--ck-page-max-width)',
        'dialog-sm': 'var(--ck-dialog-sm)',
        'dialog-md': 'var(--ck-dialog-md)',
        'dialog-lg': 'var(--ck-dialog-lg)',
        'dialog-xl': 'var(--ck-dialog-xl)',
        'support-chat': 'var(--ck-support-chat-width)',
        'entity-popover': 'var(--ck-entity-popover-min-width)',
        'floating-menu': 'var(--ck-floating-menu-min-width)'
    },
    width: {
        swatch: 'var(--ck-swatch-size)'
    },
    height: {
        swatch: 'var(--ck-swatch-size)',
        'support-chat': 'var(--ck-support-chat-height)',
        'support-chat-admin': 'var(--ck-support-chat-admin-height)',
        'preview-dialog': 'var(--ck-preview-dialog-height)'
    },
    minHeight: {
        'support-chat': 'var(--ck-support-chat-height)'
    },
    borderRadius: {
        ui: 'var(--ck-radius-ui)',
        panel: 'var(--ck-radius-panel)'
    },
    boxShadow: {
        card: 'var(--ck-shadow-card)',
        'card-hover': 'var(--ck-shadow-card-hover)',
        overlay: 'var(--ck-shadow-overlay)'
    },
    transitionDuration: {
        fast: 'var(--ck-motion-fast)',
        normal: 'var(--ck-motion-normal)'
    }
};

export const supportAvatarPalette = [
    'var(--p-red-500)',
    'var(--p-orange-500)',
    'var(--p-green-500)',
    'var(--p-blue-500)',
    'var(--p-indigo-500)',
    'var(--p-purple-500)',
    'var(--p-pink-500)'
];

const tealPrimary = {
    50: '{teal.50}',
    100: '{teal.100}',
    200: '{teal.200}',
    300: '{teal.300}',
    400: '{teal.400}',
    500: '{teal.500}',
    600: '{teal.600}',
    700: '{teal.700}',
    800: '{teal.800}',
    900: '{teal.900}',
    950: '{teal.950}'
};

const zincSurface = {
    0: '#ffffff',
    50: '{zinc.50}',
    100: '{zinc.100}',
    200: '{zinc.200}',
    300: '{zinc.300}',
    400: '{zinc.400}',
    500: '{zinc.500}',
    600: '{zinc.600}',
    700: '{zinc.700}',
    800: '{zinc.800}',
    900: '{zinc.900}',
    950: '{zinc.950}'
};

export const primeSemanticTokens = {
    transitionDuration: 'var(--ck-motion-normal)',
    primary: tealPrimary,
    focusRing: {
        width: '2px',
        style: 'solid',
        color: '{primary.500}',
        offset: '2px',
        shadow: '0 0 0 3px color-mix(in srgb, {primary.500}, transparent 78%)'
    },
    content: {
        borderRadius: 'var(--ck-radius-ui)'
    },
    formField: {
        borderRadius: 'var(--ck-radius-ui)',
        paddingX: '0.75rem',
        paddingY: '0.5625rem',
        focusRing: {
            width: '2px',
            style: 'solid',
            color: '{primary.500}',
            offset: '1px',
            shadow: '0 0 0 3px color-mix(in srgb, {primary.500}, transparent 82%)'
        }
    },
    overlay: {
        select: {
            borderRadius: 'var(--ck-radius-panel)',
            shadow: 'var(--ck-shadow-overlay)'
        },
        popover: {
            borderRadius: 'var(--ck-radius-panel)',
            shadow: 'var(--ck-shadow-overlay)'
        },
        modal: {
            borderRadius: 'var(--ck-radius-panel)',
            shadow: 'var(--ck-shadow-overlay)'
        }
    },
    colorScheme: {
        light: {
            surface: zincSurface,
            primary: {
                color: '{primary.600}',
                contrastColor: '#ffffff',
                hoverColor: '{primary.700}',
                activeColor: '{primary.800}'
            },
            content: {
                background: '#ffffff',
                hoverBackground: '{surface.100}',
                borderColor: '{surface.200}',
                color: '{surface.950}'
            },
            text: {
                color: '{surface.950}',
                hoverColor: '{surface.900}',
                mutedColor: '{surface.500}',
                hoverMutedColor: '{surface.600}'
            },
            highlight: {
                background: '{primary.50}',
                focusBackground: '{primary.100}',
                color: '{primary.800}',
                focusColor: '{primary.900}'
            }
        },
        dark: {
            surface: zincSurface,
            primary: {
                color: '{primary.400}',
                contrastColor: '{surface.950}',
                hoverColor: '{primary.300}',
                activeColor: '{primary.200}'
            },
            content: {
                background: '{surface.900}',
                hoverBackground: '{surface.800}',
                borderColor: '{surface.700}',
                color: '{surface.50}'
            },
            text: {
                color: '{surface.50}',
                hoverColor: '{surface.0}',
                mutedColor: '{surface.400}',
                hoverMutedColor: '{surface.300}'
            },
            highlight: {
                background: 'color-mix(in srgb, {primary.500}, transparent 84%)',
                focusBackground: 'color-mix(in srgb, {primary.500}, transparent 76%)',
                color: '{primary.100}',
                focusColor: '{primary.50}'
            }
        }
    }
};

export const primeComponentTokens = {
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
    },
    dialog: {
        root: {
            borderRadius: 'var(--ck-radius-panel)',
            shadow: 'var(--ck-shadow-overlay)'
        },
        header: {
            padding: '1.25rem 1.25rem 0.75rem'
        },
        content: {
            padding: '0 1.25rem 1.25rem'
        },
        footer: {
            padding: '0.75rem 1.25rem 1.25rem'
        }
    },
    panel: {
        root: {
            borderRadius: 'var(--ck-radius-panel)',
            borderColor: '{content.border.color}',
            background: '{content.background}'
        },
        header: {
            background: '{content.background}',
            padding: '1rem 1.125rem',
            borderColor: '{content.border.color}'
        },
        content: {
            padding: '1.125rem'
        }
    },
    card: {
        root: {
            background: '{content.background}',
            color: '{text.color}',
            borderRadius: 'var(--ck-radius-panel)',
            shadow: 'var(--ck-shadow-card)'
        },
        body: {
            padding: '1.125rem',
            gap: '0.875rem'
        },
        title: {
            fontSize: '1rem',
            fontWeight: '650'
        },
        subtitle: {
            color: '{text.muted.color}'
        }
    },
    button: {
        root: {
            borderRadius: 'var(--ck-radius-ui)',
            paddingX: '0.875rem',
            paddingY: '0.5625rem',
            label: {
                fontWeight: '600'
            },
            sm: {
                fontSize: '0.8125rem',
                paddingX: '0.6875rem',
                paddingY: '0.4375rem'
            }
        }
    },
    tag: {
        root: {
            borderRadius: 'var(--ck-radius-ui)',
            fontWeight: '600'
        }
    },
    chip: {
        root: {
            borderRadius: 'var(--ck-radius-ui)'
        }
    },
    datatable: {
        root: {
            borderColor: '{content.border.color}'
        },
        headerCell: {
            background: '{surface.50}',
            borderColor: '{content.border.color}',
            color: '{text.muted.color}',
            padding: '0.75rem 1rem'
        },
        bodyCell: {
            borderColor: '{content.border.color}',
            padding: '0.75rem 1rem'
        },
        row: {
            hoverBackground: '{surface.50}'
        }
    }
};
