<template>
  <div class="max-w-4xl mx-auto p-8 bg-[var(--p-content-background)] text-[var(--p-text-color)] border border-[var(--p-content-border-color)] shadow-xl rounded-2xl animate-in fade-in slide-in-from-bottom-4 duration-700">
    <div class="flex flex-col gap-8">
      <div class="border-b border-[var(--p-content-border-color)] pb-6 flex flex-col gap-2">
        <h1 class="text-4xl font-black m-0 tracking-tight text-[var(--p-primary-color)]">{{ $t('terms.title') }}</h1>
        <div class="w-20 h-1.5 bg-[var(--p-primary-color)] rounded-full"></div>
      </div>

      <div class="flex flex-col gap-4 text-lg leading-relaxed">
        <p class="m-0 font-medium">
          {{ $t('terms.welcome') }}
        </p>
        <p class="m-0 text-[var(--p-text-secondary-color)]">
          {{ $t('terms.agreement') }}
        </p>
      </div>

      <div class="flex flex-col gap-6">
        <section class="flex flex-col gap-3">
          <h2 class="text-xl font-bold uppercase tracking-wider text-[var(--p-text-color)] flex items-center gap-3">
            <i class="pi pi-info-circle text-[var(--p-primary-color)]"></i>
            {{ $t('terms.philosophyTitle') }}
          </h2>
          <p class="m-0 text-[var(--p-text-secondary-color)] leading-relaxed">
            {{ $t('terms.philosophyText') }}
          </p>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-xl font-bold uppercase tracking-wider text-[var(--p-text-color)] flex items-center gap-3">
            <i class="pi pi-file text-[var(--p-primary-color)]"></i>
            {{ $t('terms.licenseTitle') }}
          </h2>
          <p class="m-0 text-[var(--p-text-secondary-color)] leading-relaxed">
            {{ $t('terms.licenseText') }}
            <a
              href="https://opensource.org/licenses/MIT"
              class="text-[var(--p-primary-color)] font-bold no-underline hover:underline transition-all"
              >{{ $t('terms.mitLicense') }}</a
            >.
          </p>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-xl font-bold uppercase tracking-wider text-[var(--p-text-color)] flex items-center gap-3">
            <i class="pi pi-check-square text-[var(--p-primary-color)]"></i>
            {{ $t('terms.guidelinesTitle') }}
          </h2>
          <ul class="list-none m-0 p-0 flex flex-col gap-2">
            <li class="flex items-start gap-3 text-[var(--p-text-secondary-color)]">
              <i class="pi pi-check text-[var(--p-primary-color)] mt-1"></i>
              <span>{{ $t('terms.guideline1') }}</span>
            </li>
            <li class="flex items-start gap-3 text-[var(--p-text-secondary-color)]">
              <i class="pi pi-check text-[var(--p-primary-color)] mt-1"></i>
              <span>{{ $t('terms.guideline2') }}</span>
            </li>
            <li class="flex items-start gap-3 text-[var(--p-text-secondary-color)]">
              <i class="pi pi-check text-[var(--p-primary-color)] mt-1"></i>
              <span>{{ $t('terms.guideline3') }}</span>
            </li>
          </ul>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-xl font-bold uppercase tracking-wider text-[var(--p-text-color)] flex items-center gap-3">
            <i class="pi pi-lock text-[var(--p-primary-color)]"></i>
            {{ $t('terms.restrictionsTitle') }}
          </h2>
          <ul class="list-none m-0 p-0 flex flex-col gap-2">
            <li class="flex items-start gap-3 text-[var(--p-text-secondary-color)]">
              <i class="pi pi-exclamation-circle text-[var(--p-primary-color)] mt-1"></i>
              <span>{{ $t('terms.restriction1') }}</span>
            </li>
            <li class="flex items-start gap-3 text-[var(--p-text-secondary-color)]">
              <i class="pi pi-exclamation-circle text-[var(--p-primary-color)] mt-1"></i>
              <span>{{ $t('terms.restriction2') }}</span>
            </li>
            <li class="flex items-start gap-3 text-[var(--p-text-secondary-color)]">
              <i class="pi pi-exclamation-circle text-[var(--p-primary-color)] mt-1"></i>
              <span>{{ $t('terms.restriction3') }}</span>
            </li>
          </ul>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-xl font-bold uppercase tracking-wider text-[var(--p-text-color)] flex items-center gap-3">
            <i class="pi pi-shield text-[var(--p-primary-color)]"></i>
            {{ $t('terms.disclaimerTitle') }}
          </h2>
          <p class="m-0 text-[var(--p-text-secondary-color)] leading-relaxed italic border-l-4 border-[var(--p-primary-color)] pl-4 py-1 bg-[var(--p-content-background)]">
            {{ $t('terms.disclaimerText') }}
          </p>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-xl font-bold uppercase tracking-wider text-[var(--p-text-color)] flex items-center gap-3">
            <i class="pi pi-envelope text-[var(--p-primary-color)]"></i>
            {{ $t('terms.contactTitle') }}
          </h2>
          <p class="m-0 text-[var(--p-text-secondary-color)] leading-relaxed">
            {{ $t('terms.contactText') }}
            <a
              :href="`mailto:${$t('terms.contactEmail')}`"
              class="text-[var(--p-primary-color)] font-bold no-underline hover:underline transition-all"
              >{{ $t('terms.contactEmail') }}</a
            >
          </p>
        </section>
      </div>

      <div class="mt-8 pt-8 border-t border-[var(--p-content-border-color)] flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-bold uppercase tracking-widest text-[var(--p-text-muted-color)]">
        <span>{{ $t('terms.lastUpdated') }}</span>
        <a
          href="https://github.com/1suo/cutkit"
          class="flex items-center gap-2 text-[var(--p-text-color)] no-underline hover:text-[var(--p-primary-color)] transition-colors"
        >
          <i class="pi pi-github"></i>
          {{ $t('terms.githubRepository') }}
        </a>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: "app",
});
</script>
