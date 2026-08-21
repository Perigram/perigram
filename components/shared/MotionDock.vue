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
                :spring="spring"
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
     * model while resolving visual treatment through CutKit design tokens.
     */
    import { AnimatePresence, Motion, useMotionValue, useSpring, useTransform } from 'motion-v'
    import type { ConcreteComponent, CSSProperties, PropType } from 'vue'
    import { computed, defineComponent, h, onMounted, onUnmounted, ref, watch } from 'vue'
    import { useReducedMotion } from '~/composables/useReducedMotion.js'

    const MotionComponent = Motion as unknown as ConcreteComponent
    const AnimatePresenceComponent = AnimatePresence as unknown as ConcreteComponent
    const dockDefaults = {
        distance: 96,
        panelHeight: 40,
        baseItemSize: 32,
        height: 64,
        magnification: 40,
        spring: { mass: 0.1, stiffness: 180, damping: 16 },
    }

    export type SpringOptions = NonNullable<Parameters<typeof useSpring>[1]>

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

    const DockIcon = defineComponent({
        name: 'DockIcon',
        props: {
            className: { type: String, default: '' },
        },
        render() {
            return h(
                'span',
                {
                    style: {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    } satisfies CSSProperties,
                    class: this.className,
                },
                this.$slots.default?.(),
            )
        },
    })

    const DockLabel = defineComponent({
        name: 'DockLabel',
        props: {
            className: { type: String, default: '' },
            isHovered: {
                type: Object as PropType<ReturnType<typeof useMotionValue<number>>>,
                required: true,
            },
            reducedMotion: { type: Boolean, required: true },
        },
        setup(props) {
            const isVisible = ref(false)
            let unsubscribe: (() => void) | null = null

            onMounted(() => {
                unsubscribe = props.isHovered.on('change', (latest: number) => {
                    isVisible.value = latest === 1
                })
            })

            onUnmounted(() => {
                unsubscribe?.()
            })

            return { isVisible }
        },
        render() {
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
            }

            if (this.reducedMotion) {
                return this.isVisible
                    ? h(
                          'div',
                          {
                              class: this.className,
                              role: 'tooltip',
                              style: labelStyle,
                          },
                          this.$slots.default?.(),
                      )
                    : null
            }

            return h(AnimatePresenceComponent, {}, () =>
                this.isVisible
                    ? [
                          h(
                              MotionComponent,
                              {
                                  key: 'label',
                                  as: 'div',
                                  class: this.className,
                                  role: 'tooltip',
                                  style: labelStyle,
                                  initial: { opacity: 0, y: 0 },
                                  animate: { opacity: 1, y: -6 },
                                  exit: { opacity: 0, y: 0 },
                                  transition: { duration: 0.16 },
                              },
                              () => this.$slots.default?.(),
                          ),
                      ]
                    : [],
            )
        },
    })

    const DockItem = defineComponent({
        name: 'DockItem',
        props: {
            mouseX: {
                type: Object as PropType<ReturnType<typeof useMotionValue<number>>>,
                required: true,
            },
            spring: { type: Object as PropType<SpringOptions>, required: true },
            distance: { type: Number, required: true },
            baseItemSize: { type: Number, required: true },
            magnification: { type: Number, required: true },
            reducedMotion: { type: Boolean, required: true },
            item: { type: Object as PropType<DockItemData>, required: true },
        },
        setup(props) {
            const itemRef = ref<HTMLButtonElement | null>(null)
            const isHovered = useMotionValue(0)
            const currentSize = ref(props.baseItemSize)
            const isFocused = ref(false)

            const mouseDistance = useTransform(props.mouseX, (value: number) => {
                const rect = itemRef.value?.getBoundingClientRect() ?? { x: 0, width: props.baseItemSize }
                return value - rect.x - props.baseItemSize / 2
            })

            const targetSize = useTransform(mouseDistance, (distanceFromPointer: number) => {
                if (props.reducedMotion) return props.baseItemSize

                const clamped = Math.max(-props.distance, Math.min(props.distance, distanceFromPointer))
                const proximity = 1 - Math.abs(clamped) / props.distance
                return props.baseItemSize + (props.magnification - props.baseItemSize) * proximity
            })

            const size = useSpring(targetSize, props.spring)

            watch(
                () => ({ baseItemSize: props.baseItemSize, reducedMotion: props.reducedMotion }),
                ({ baseItemSize, reducedMotion }) => {
                    currentSize.value = baseItemSize

                    if (reducedMotion) size.jump(baseItemSize)
                    else size.set(baseItemSize)
                },
            )

            const handleHoverStart = (event: MouseEvent) => {
                isHovered.set(1)
                props.item.onHoverStart?.(event)
            }
            const handleHoverEnd = (event: MouseEvent) => {
                isHovered.set(0)
                props.item.onHoverEnd?.(event)
            }
            const handleFocus = (event: FocusEvent) => {
                isHovered.set(1)
                isFocused.value = true
                props.item.onFocus?.(event)
            }
            const handleBlur = (event: FocusEvent) => {
                isHovered.set(0)
                isFocused.value = false
                props.item.onBlur?.(event)
            }
            const handleClick = (event: MouseEvent) => {
                if (!props.item.disabled) props.item.onClick(event)
            }
            const setItemRef = (element: HTMLButtonElement | null) => {
                itemRef.value = element
            }
            let unsubscribeSize: (() => void) | null = null
            let boundButton: HTMLButtonElement | null = null

            onMounted(() => {
                unsubscribeSize = size.on('change', (latest: number) => {
                    currentSize.value = latest
                })
                boundButton = itemRef.value
                boundButton?.addEventListener('mouseenter', handleHoverStart)
                boundButton?.addEventListener('mouseleave', handleHoverEnd)
                boundButton?.addEventListener('focus', handleFocus)
                boundButton?.addEventListener('blur', handleBlur)
                boundButton?.addEventListener('click', handleClick)
            })

            onUnmounted(() => {
                unsubscribeSize?.()
                boundButton?.removeEventListener('mouseenter', handleHoverStart)
                boundButton?.removeEventListener('mouseleave', handleHoverEnd)
                boundButton?.removeEventListener('focus', handleFocus)
                boundButton?.removeEventListener('blur', handleBlur)
                boundButton?.removeEventListener('click', handleClick)
            })

            return {
                currentSize,
                isHovered,
                isFocused,
                setItemRef,
                handleHoverStart,
                handleHoverEnd,
                handleFocus,
                handleBlur,
                handleClick,
            }
        },
        render() {
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
            const children = [
                h(DockIcon, {}, () => [icon]),
                h(DockLabel, { isHovered: this.isHovered, reducedMotion: this.reducedMotion }, () => [this.item.label]),
            ]

            if (this.item.attention) children.splice(1, 0, h('span', { style: indicatorStyle, 'aria-hidden': 'true' }))

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
            distance: { type: Number, default: dockDefaults.distance },
            panelHeight: { type: Number, default: dockDefaults.panelHeight },
            baseItemSize: { type: Number, default: dockDefaults.baseItemSize },
            dockHeight: { type: Number, default: dockDefaults.height },
            magnification: { type: Number, default: dockDefaults.magnification },
            spring: {
                type: Object as PropType<SpringOptions>,
                default: () => ({ ...dockDefaults.spring }),
            },
        },
        setup(props) {
            const mouseX = useMotionValue(Infinity)
            const isHovered = useMotionValue(0)
            const currentHeight = ref(props.panelHeight)
            const reducedMotion = useReducedMotion()

            const maxHeight = computed(() =>
                Math.max(props.dockHeight, props.magnification + props.magnification / 2 + 4),
            )
            const heightRow = useTransform(isHovered, (hovered: number) =>
                !reducedMotion.value && hovered === 1 ? maxHeight.value : props.panelHeight,
            )
            const height = useSpring(heightRow, props.spring)

            watch([() => props.panelHeight, maxHeight, reducedMotion], () => {
                const nextHeight = !reducedMotion.value && isHovered.get() === 1 ? maxHeight.value : props.panelHeight

                if (reducedMotion.value) {
                    currentHeight.value = props.panelHeight
                    height.jump(nextHeight)
                    mouseX.set(Infinity)
                } else height.set(nextHeight)
            })

            let unsubscribeHeight: (() => void) | null = null

            onMounted(() => {
                unsubscribeHeight = height.on('change', (latest: number) => {
                    currentHeight.value = latest
                })
            })

            onUnmounted(() => {
                unsubscribeHeight?.()
            })

            const handleMouseMove = (event: MouseEvent) => {
                if (reducedMotion.value) return

                isHovered.set(1)
                mouseX.set(event.clientX)
            }
            const handleMouseLeave = () => {
                isHovered.set(0)
                mouseX.set(Infinity)
            }
            const outerStyle = computed<CSSProperties>(() => ({
                height: `${currentHeight.value}px`,
                scrollbarWidth: 'none',
                margin: '0 var(--p-toolbar-padding)',
                display: 'flex',
                maxWidth: '100%',
                alignItems: 'center',
            }))
            const panelStyle = computed<CSSProperties>(() => ({
                height: `${props.panelHeight}px`,
                position: 'absolute',
                bottom: 'var(--p-toolbar-padding)',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                width: 'fit-content',
                maxWidth: 'calc(100% - var(--p-toolbar-padding) - var(--p-toolbar-padding))',
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
