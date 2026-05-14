export const designTokens = {
    color: {
        primary: 'var(--p-primary-color)',
        primaryContrast: 'var(--p-primary-contrast-color)',
        primaryEmphasis: 'var(--p-primary-emphasis-color)',
        text: 'var(--p-text-color)',
        textMuted: 'var(--p-text-muted-color)',
        content: 'var(--p-content-background)',
        contentBorder: 'var(--p-content-border-color)'
    },
    layout: {
        pageMaxWidth: '1600px',
        gridGap: '1.5rem',
        detailsGap: '2rem',
        dialogSm: '24rem',
        dialogMd: '42rem',
        dialogLg: '56rem',
        dialogXl: '72rem'
    },
    radius: {
        ui: '0.5rem',
        full: '9999px'
    },
    motion: {
        fast: '120ms',
        normal: '200ms'
    }
};

export const cssVariableTokens = {
    '--ck-page-max-width': designTokens.layout.pageMaxWidth,
    '--ck-grid-gap': designTokens.layout.gridGap,
    '--ck-details-gap': designTokens.layout.detailsGap,
    '--ck-dialog-sm': designTokens.layout.dialogSm,
    '--ck-dialog-md': designTokens.layout.dialogMd,
    '--ck-dialog-lg': designTokens.layout.dialogLg,
    '--ck-dialog-xl': designTokens.layout.dialogXl,
    '--ck-radius-ui': designTokens.radius.ui,
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
        app: 'var(--ck-page-max-width)'
    },
    borderRadius: {
        ui: 'var(--ck-radius-ui)'
    },
    transitionDuration: {
        fast: 'var(--ck-motion-fast)',
        normal: 'var(--ck-motion-normal)'
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
        borderRadius: 'var(--ck-radius-ui)'
    },
    panel: {
        borderRadius: 'var(--ck-radius-ui)'
    },
    card: {
        borderRadius: 'var(--ck-radius-ui)'
    }
};
