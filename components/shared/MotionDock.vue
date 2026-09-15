<template>
    <div
        :style="outerStyle"
        @mousedown.stop
        @click.stop
    >
        <div
            :style="panelStyle"
            :class="className"
            role="toolbar"
            :aria-label="ariaLabel"
            @mousemove="handleMouseMove"
            @mouseleave="handleMouseLeave"
        >
            <DockItem
                v-for="(item, index) in items"
                :key="index"
                :mouseX="mouseX"
                :distance="distance"
                :magnification="magnification"
                :baseItemSize="baseItemSize"
                :reducedMotion="reducedMotion"
                :item="item"
            />
        </div>
    </div>
</template>

<script lang="ts">
    /*
     * MotionDock is adapted from the Vue Bits Dock block
     * (https://vue-bits.dev/components/dock).
     * Copyright (c) 2025 David Haz
     *
     * Permission is granted to use, copy, modify, merge, publish, and distribute
     * this block as part of an application, website, or product. This copyright
     * and permission notice must be retained in substantial copies. The included
     * Commons Clause restriction prohibits selling, sublicensing, or redistributing
     * the components themselves. This local adaptation keeps the published motion
     * model — animated through the shared GSAP motion patterns in
     * composables/useMotion.js — while resolving visual treatment through CutKit
     * design tokens.
     */
    import type { CSSProperties, PropType } from 'vue'
    import { computed, defineComponent, h, onMounted, onUnmounted, ref, watch } from 'vue'
    import { useReducedMotion } from '~/composables/useReducedMotion.js'
    import { useEnterExit, useFollowValue } from '~/composables/useMotion.js'

    const dockDefaults = {
        distance: 96,
        panelHeight: 40,
        baseItemSize: 32,
        height: 64,
        magnification: 40,
        follow: { duration: 0.3, ease: 'power3.out' },
    }

    export type DockItemData = {
        icon: unknown
        label: string
        onClick: (event: MouseEvent) => void
        className?: string
        disabled?: boolean
        pressed?: boolean
        attention?: boolean
        hasPopup?: boolean
        onHoverStart?: (event: MouseEvent) => void
        onHoverEnd?: (event: MouseEvent) => void
        onFocus?: (event: FocusEvent) => void
        onBlur?: (event: FocusEvent) => void
    }

    const DockItem = defineComponent({
        name: 'DockItem',
        props: {
            mouseX: { type: Number, default: Infinity },
            distance: { type: Number, required: true },
            baseItemSize: { type: Number, required: true },
            magnification: { type: Number, required: true },
            reducedMotion: { type: Boolean, required: true },
            item: { type: Object as PropType<DockItemData>, required: true },
        },
        setup(props) {
            const itemRef = ref<HTMLButtonElement | null>(null)
            const labelRef = ref<HTMLDivElement | null>(null)
            const isFocused = ref(false)
            const isHovered = ref(false)

            const size = useFollowValue(props.baseItemSize, dockDefaults.follow)

            const labelVisible = computed(() => isHovered.value || isFocused.value)
            useEnterExit(labelRef, labelVisible, { y: 6, duration: 0.16 })

            const updateSizeForPointer = (mouseX: number) => {
                if (props.reducedMotion || !Number.isFinite(mouseX)) return
                const rect = itemRef.value?.getBoundingClientRect()
                if (!rect) return
                const distanceFromPointer = mouseX - rect.x - props.baseItemSize / 2
                const clamped = Math.max(-props.distance, Math.min(props.distance, distanceFromPointer))
                const proximity = 1 - Math.abs(clamped) / props.distance
                size.set(props.baseItemSize + (props.magnification - props.baseItemSize) * proximity)
            }

            watch(() => props.mouseX, updateSizeForPointer)

            watch(
                () => ({ baseItemSize: props.baseItemSize, reducedMotion: props.reducedMotion }),
                ({ baseItemSize, reducedMotion }) => {
                    if (reducedMotion) size.jump(baseItemSize)
                    else size.set(baseItemSize)
                },
            )

            const handleHoverStart = (event: MouseEvent) => {
                isHovered.value = true
                props.item.onHoverStart?.(event)
            }
            const handleHoverEnd = (event: MouseEvent) => {
                isHovered.value = false
                props.item.onHoverEnd?.(event)
            }
            const handleFocus = (event: FocusEvent) => {
                isHovered.value = true
                isFocused.value = true
                props.item.onFocus?.(event)
            }
            const handleBlur = (event: FocusEvent) => {
                isHovered.value = false
                isFocused.value = false
                props.item.onBlur?.(event)
            }
            const handleClick = (event: MouseEvent) => {
                if (!props.item.disabled) props.item.onClick(event)
            }
            const setItemRef = (element: HTMLButtonElement | null) => {
                itemRef.value = element
            }
            const setLabelRef = (element: HTMLDivElement | null) => {
                labelRef.value = element
            }
            let boundButton: HTMLButtonElement | null = null

            onMounted(() => {
                boundButton = itemRef.value
                boundButton?.addEventListener('mouseenter', handleHoverStart)
                boundButton?.addEventListener('mouseleave', handleHoverEnd)
                boundButton?.addEventListener('focus', handleFocus)
                boundButton?.addEventListener('blur', handleBlur)
                boundButton?.addEventListener('click', handleClick)
            })

            onUnmounted(() => {
                boundButton?.removeEventListener('mouseenter', handleHoverStart)
                boundButton?.removeEventListener('mouseleave', handleHoverEnd)
                boundButton?.removeEventListener('focus', handleFocus)
                boundButton?.removeEventListener('blur', handleBlur)
                boundButton?.removeEventListener('click', handleClick)
            })

            return {
                currentSize: size.current,
                labelVisible,
                setItemRef,
                setLabelRef,
                handleHoverStart,
                handleHoverEnd,
                handleFocus,
                handleBlur,
                handleClick,
            }
        },
        render() {
            if ((this.item as DockItemData & { separator?: boolean }).separator) {
                return h('span', {
                    style: {
                        width: '1px',
                        height: `${Math.round(this.baseItemSize * 0.7)}px`,
                        flex: '0 0 auto',
                        alignSelf: 'center',
                        backgroundColor: 'var(--p-content-border-color)',
                    } satisfies CSSProperties,
                    'aria-hidden': 'true',
                })
            }
            const icon = typeof this.item.icon === 'function' ? (this.item.icon as () => unknown)() : this.item.icon
            const itemStyle: CSSProperties = {
                width: `${this.currentSize}px`,
                height: `${this.currentSize}px`,
                position: 'relative',
                display: 'inline-flex',
                flex: '0 0 auto',
                boxSizing: 'border-box',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--p-border-radius-md)',
                backgroundColor:
                    this.item.pressed || this.isFocused ? 'var(--p-content-hover-background)' : 'transparent',
                border: this.isFocused ? '1px solid var(--p-primary-color)' : '1px solid transparent',
                color: 'var(--p-text-color)',
                cursor: this.item.disabled ? 'not-allowed' : 'pointer',
                opacity: this.item.disabled ? 0.45 : 1,
                outline: 'none',
                transition:
                    'background-color var(--p-transition-duration), border-color var(--p-transition-duration), opacity var(--p-transition-duration)',
            }
            const indicatorStyle: CSSProperties = {
                position: 'absolute',
                top: '0.125rem',
                right: '0.125rem',
                width: '0.375rem',
                height: '0.375rem',
                borderRadius: 'var(--p-border-radius-xl)',
                backgroundColor: 'var(--p-primary-color)',
                border: '1px solid var(--p-content-background)',
            }
            const labelStyle: CSSProperties = {
                position: 'absolute',
                bottom: '100%',
                transform: 'translateX(-50%)',
                marginBottom: 'var(--p-tooltip-gutter)',
                width: 'fit-content',
                whiteSpace: 'pre',
                borderRadius: 'var(--p-border-radius-md)',
                border: '1px solid var(--p-content-border-color)',
                backgroundColor: 'var(--p-content-background)',
                padding: 'var(--p-tooltip-padding)',
                fontSize: '0.75rem',
                color: 'var(--p-text-color)',
                boxShadow: 'none',
                opacity: 0,
            }
            const children = [
                h(
                    'span',
                    {
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        } satisfies CSSProperties,
                    },
                    [icon],
                ),
            ]

            if (this.item.attention) children.push(h('span', { style: indicatorStyle, 'aria-hidden': 'true' }))

            if (!this.reducedMotion || this.labelVisible) {
                children.push(
                    h(
                        'div',
                        {
                            ref: this.setLabelRef,
                            role: 'tooltip',
                            style: this.reducedMotion ? { ...labelStyle, opacity: 1 } : labelStyle,
                        },
                        [this.item.label],
                    ),
                )
            }

            return h(
                'button',
                {
                    ref: this.setItemRef,
                    type: 'button',
                    style: itemStyle,
                    class: this.item.className,
                    disabled: this.item.disabled,
                    'aria-label': this.item.label,
                    'aria-pressed': typeof this.item.pressed === 'boolean' ? this.item.pressed : undefined,
                    'aria-haspopup': this.item.hasPopup ? 'dialog' : undefined,
                },
                children,
            )
        },
    })

    export default defineComponent({
        name: 'MotionDock',
        components: { DockItem },
        props: {
            items: { type: Array as PropType<DockItemData[]>, required: true },
            ariaLabel: { type: String, default: '' },
            className: { type: String, default: '' },
            placement: { type: String as PropType<'top' | 'bottom'>, default: 'bottom' },
            distance: { type: Number, default: dockDefaults.distance },
            panelHeight: { type: Number, default: dockDefaults.panelHeight },
            baseItemSize: { type: Number, default: dockDefaults.baseItemSize },
            dockHeight: { type: Number, default: dockDefaults.height },
            magnification: { type: Number, default: dockDefaults.magnification },
        },
        setup(props) {
            const mouseX = ref(Infinity)
            const isHovered = ref(false)
            const reducedMotion = useReducedMotion()

            const maxHeight = computed(() =>
                Math.max(props.dockHeight, props.magnification + props.magnification / 2 + 4),
            )
            const height = useFollowValue(props.panelHeight, dockDefaults.follow)

            watch([() => props.panelHeight, maxHeight, reducedMotion], () => {
                const nextHeight = !reducedMotion.value && isHovered.value ? maxHeight.value : props.panelHeight

                if (reducedMotion.value) {
                    mouseX.value = Infinity
                    height.jump(nextHeight)
                } else height.set(nextHeight)
            })

            const handleMouseMove = (event: MouseEvent) => {
                if (reducedMotion.value) return

                isHovered.value = true
                mouseX.value = event.clientX
            }
            const handleMouseLeave = () => {
                isHovered.value = false
                mouseX.value = Infinity
            }
            const outerStyle = computed<CSSProperties>(() => ({
                height: `${height.current.value}px`,
                scrollbarWidth: 'none',
                margin: '0 var(--p-toolbar-padding)',
                display: 'flex',
                maxWidth: '100%',
                alignItems: 'center',
            }))
            const panelStyle = computed<CSSProperties>(() => ({
                height: `${props.panelHeight}px`,
                position: 'absolute',
                ...(props.placement === 'top'
                    ? { top: '0' }
                    : { bottom: 'var(--p-toolbar-padding)' }),
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                width: 'fit-content',
                maxWidth: 'calc(100% - var(--p-toolbar-padding) - var(--p-toolbar-padding))',
                overflowX: 'auto',
                scrollbarWidth: 'none',
                gap: 'var(--p-toolbar-gap)',
                borderRadius: 'var(--p-border-radius-lg)',
                backgroundColor: 'var(--p-content-background)',
                border: '1px solid var(--p-content-border-color)',
                padding: 'var(--p-toolbar-padding)',
                boxShadow: 'none',
                zIndex: 30,
            }))

            return {
                mouseX,
                reducedMotion,
                outerStyle,
                panelStyle,
                handleMouseMove,
                handleMouseLeave,
            }
        },
    })
</script>
