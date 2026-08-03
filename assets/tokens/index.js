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
        boundedGridItemMinWidth: '24rem',
        boundedGridItemMaxWidth: '32rem',
        compactPreviewWidth: '10rem',
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
        ui: '0.375rem',
        panel: '0.75rem',
        full: '9999px'
    },
    shadow: {
        card: '0 0 0 1px rgb(15 23 42 / 0.08), 0 1px 2px rgb(15 23 42 / 0.06), 0 8px 20px rgb(15 23 42 / 0.05)',
        cardHover: '0 0 0 1px rgb(8 145 178 / 0.30), 0 2px 4px rgb(15 23 42 / 0.08), 0 14px 30px rgb(15 23 42 / 0.12)',
        overlay: '0 0 0 1px rgb(15 23 42 / 0.10), 0 24px 64px rgb(15 23 42 / 0.20)'
    },
    motion: {
        fast: '110ms',
        normal: '180ms'
    }
};

export const cssVariableTokens = {
    '--ck-page-background': 'var(--p-surface-50)',
    '--ck-chrome-background': 'color-mix(in srgb, var(--p-content-background), transparent 3%)',
    '--ck-subtle-background': 'var(--p-surface-100)',
    '--ck-page-max-width': designTokens.layout.pageMaxWidth,
    '--ck-grid-gap': designTokens.layout.gridGap,
    '--ck-bounded-grid-item-min-width': designTokens.layout.boundedGridItemMinWidth,
    '--ck-bounded-grid-item-max-width': designTokens.layout.boundedGridItemMaxWidth,
    '--ck-compact-preview-width': designTokens.layout.compactPreviewWidth,
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

const cyanPrimary = {
    50: '{cyan.50}',
    100: '{cyan.100}',
    200: '{cyan.200}',
    300: '{cyan.300}',
    400: '{cyan.400}',
    500: '{cyan.500}',
    600: '{cyan.600}',
    700: '{cyan.700}',
    800: '{cyan.800}',
    900: '{cyan.900}',
    950: '{cyan.950}'
};

const slateSurface = {
    0: '#ffffff',
    50: '{slate.50}',
    100: '{slate.100}',
    200: '{slate.200}',
    300: '{slate.300}',
    400: '{slate.400}',
    500: '{slate.500}',
    600: '{slate.600}',
    700: '{slate.700}',
    800: '{slate.800}',
    900: '{slate.900}',
    950: '{slate.950}'
};

export const primeSemanticTokens = {
    transitionDuration: 'var(--ck-motion-normal)',
    primary: cyanPrimary,
    focusRing: {
        width: '2px',
        style: 'solid',
        color: '{primary.600}',
        offset: '2px',
        shadow: '0 0 0 3px color-mix(in srgb, {primary.500}, transparent 76%)'
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
            color: '{primary.600}',
            offset: '1px',
            shadow: '0 0 0 3px color-mix(in srgb, {primary.500}, transparent 80%)'
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
            surface: slateSurface,
            primary: {
                color: '{primary.700}',
                contrastColor: '#ffffff',
                hoverColor: '{primary.800}',
                activeColor: '{primary.900}'
            },
            content: {
                background: '#ffffff',
                hoverBackground: '{surface.100}',
                borderColor: 'color-mix(in srgb, {surface.300}, transparent 16%)',
                color: '{surface.950}'
            },
            text: {
                color: '{surface.950}',
                hoverColor: '{surface.900}',
                mutedColor: '{surface.500}',
                hoverMutedColor: '{surface.600}'
            },
            formField: {
                background: '{surface.0}',
                disabledBackground: '{surface.100}',
                filledBackground: '{surface.50}',
                filledHoverBackground: '{surface.100}',
                filledFocusBackground: '{surface.0}',
                borderColor: '{surface.300}',
                hoverBorderColor: '{surface.400}',
                focusBorderColor: '{primary.600}',
                invalidBorderColor: '{red.500}',
                color: '{surface.900}',
                disabledColor: '{surface.500}',
                placeholderColor: '{surface.500}',
                invalidPlaceholderColor: '{red.600}'
            },
            highlight: {
                background: 'color-mix(in srgb, {primary.100}, transparent 12%)',
                focusBackground: '{primary.200}',
                color: '{primary.900}',
                focusColor: '{primary.900}'
            }
        },
        dark: {
            surface: slateSurface,
            primary: {
                color: '{primary.400}',
                contrastColor: '{surface.950}',
                hoverColor: '{primary.300}',
                activeColor: '{primary.200}'
            },
            content: {
                background: '{surface.900}',
                hoverBackground: '{surface.800}',
                borderColor: 'color-mix(in srgb, {surface.600}, transparent 46%)',
                color: '{surface.50}'
            },
            text: {
                color: '{surface.50}',
                hoverColor: '{surface.0}',
                mutedColor: '{surface.400}',
                hoverMutedColor: '{surface.300}'
            },
            formField: {
                background: '{surface.950}',
                disabledBackground: '{surface.900}',
                filledBackground: '{surface.900}',
                filledHoverBackground: '{surface.800}',
                filledFocusBackground: '{surface.950}',
                borderColor: '{surface.700}',
                hoverBorderColor: '{surface.600}',
                focusBorderColor: '{primary.400}',
                invalidBorderColor: '{red.400}',
                color: '{surface.50}',
                disabledColor: '{surface.500}',
                placeholderColor: '{surface.400}',
                invalidPlaceholderColor: '{red.400}'
            },
            highlight: {
                background: 'color-mix(in srgb, {primary.500}, transparent 86%)',
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
            background: '{content.background}',
            borderColor: '{content.border.color}',
            color: '{content.color}',
            borderRadius: 'var(--ck-radius-panel)',
            shadow: 'var(--ck-shadow-overlay)'
        },
        title: {
            fontSize: '1rem',
            fontWeight: '650'
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
            background: '{content.background}',
            color: '{content.color}'
        },
        header: {
            background: '{content.hover.background}',
            padding: '1rem 1.125rem',
            borderColor: '{content.border.color}',
            borderWidth: '0 0 1px'
        },
        title: {
            fontWeight: '650'
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
            gap: '0.5rem',
            paddingX: '0.8125rem',
            paddingY: '0.5rem',
            iconOnlyWidth: '2.375rem',
            raisedShadow: 'var(--ck-shadow-card)',
            label: {
                fontWeight: '600'
            },
            sm: {
                fontSize: '0.8125rem',
                paddingX: '0.625rem',
                paddingY: '0.375rem',
                iconOnlyWidth: '2rem'
            }
        }
    },
    tag: {
        root: {
            borderRadius: 'var(--ck-radius-ui)',
            fontWeight: '650',
            padding: '0.1875rem 0.5rem'
        }
    },
    chip: {
        root: {
            borderRadius: 'var(--ck-radius-ui)'
        }
    },
    menu: {
        root: {
            background: '{content.background}',
            borderColor: '{content.border.color}',
            color: '{content.color}',
            borderRadius: 'var(--ck-radius-panel)',
            shadow: 'var(--ck-shadow-overlay)'
        },
        list: {
            padding: '0.3125rem',
            gap: '0.125rem'
        },
        item: {
            focusBackground: '{content.hover.background}',
            color: '{text.color}',
            focusColor: '{text.color}',
            padding: '0.5rem 0.625rem',
            borderRadius: 'var(--ck-radius-ui)',
            gap: '0.5rem',
            icon: {
                color: '{text.muted.color}',
                focusColor: '{primary.color}'
            }
        },
        separator: {
            borderColor: '{content.border.color}'
        }
    },
    tabs: {
        root: {
            transitionDuration: 'var(--ck-motion-normal)'
        },
        tablist: {
            background: 'transparent',
            borderWidth: '0 0 1px',
            borderColor: '{content.border.color}'
        },
        tab: {
            background: 'transparent',
            hoverBackground: '{content.hover.background}',
            activeBackground: 'transparent',
            color: '{text.muted.color}',
            hoverColor: '{text.color}',
            activeColor: '{primary.color}',
            padding: '0.75rem 0.875rem',
            fontWeight: '600'
        },
        activeBar: {
            height: '2px',
            background: '{primary.color}'
        }
    },
    tabview: {
        root: {
            transitionDuration: 'var(--ck-motion-normal)'
        },
        tabList: {
            background: 'transparent',
            borderColor: '{content.border.color}'
        },
        tab: {
            borderColor: '{content.border.color}',
            activeBorderColor: '{primary.color}',
            color: '{text.muted.color}',
            hoverColor: '{text.color}',
            activeColor: '{primary.color}'
        },
        tabPanel: {
            background: 'transparent',
            color: '{text.color}'
        }
    },
    drawer: {
        root: {
            background: '{content.background}',
            borderColor: '{content.border.color}',
            color: '{content.color}',
            shadow: 'var(--ck-shadow-overlay)'
        },
        header: {
            padding: '1rem 1.125rem'
        },
        title: {
            fontSize: '1rem',
            fontWeight: '650'
        },
        content: {
            padding: '0 1.125rem 1.125rem'
        }
    },
    toast: {
        root: {
            borderRadius: 'var(--ck-radius-panel)',
            borderWidth: '1px',
            transitionDuration: 'var(--ck-motion-normal)'
        },
        content: {
            padding: '0.875rem 1rem'
        },
        summary: {
            fontWeight: '650'
        }
    },
    datatable: {
        root: {
            borderColor: '{content.border.color}'
        },
        headerCell: {
            borderColor: '{content.border.color}',
            color: '{text.muted.color}',
            padding: '0.75rem 1rem'
        },
        bodyCell: {
            borderColor: '{content.border.color}',
            padding: '0.75rem 1rem'
        },
        row: {
            color: '{text.color}'
        },
        columnTitle: {
            fontWeight: '650'
        },
        colorScheme: {
            light: {
                headerCell: {
                    background: '{surface.100}',
                    hoverBackground: '{surface.200}',
                    selectedBackground: '{primary.50}'
                },
                row: {
                    background: '{content.background}',
                    hoverBackground: '{surface.50}',
                    selectedBackground: '{primary.50}',
                    selectedColor: '{primary.900}'
                }
            },
            dark: {
                headerCell: {
                    background: '{surface.800}',
                    hoverBackground: '{surface.700}',
                    selectedBackground: 'color-mix(in srgb, {primary.500}, transparent 78%)'
                },
                row: {
                    background: '{content.background}',
                    hoverBackground: 'color-mix(in srgb, {surface.700}, transparent 58%)',
                    selectedBackground: 'color-mix(in srgb, {primary.500}, transparent 82%)',
                    selectedColor: '{primary.100}'
                }
            }
        }
    }
};
