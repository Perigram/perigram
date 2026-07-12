<template>
  <StandardPage :title="$t('terms.title')">
    <div class="flex flex-col gap-8">
      <div class="flex flex-col gap-4">
        <p class="m-0">
          {{ $t('terms.welcome') }}
        </p>
        <p class="m-0">
          {{ $t('terms.agreement') }}
        </p>
      </div>

      <div class="flex flex-col gap-6">
        <section class="flex flex-col gap-3">
          <h2 class="flex items-center gap-3">
            <i class="pi pi-info-circle"></i>
            {{ $t('terms.philosophyTitle') }}
          </h2>
          <p class="m-0">
            {{ $t('terms.philosophyText') }}
          </p>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="flex items-center gap-3">
            <i class="pi pi-file"></i>
            {{ $t('terms.licenseTitle') }}
          </h2>
          <p class="m-0">
            {{ $t('terms.licenseText') }}
            <a
              href="https://opensource.org/licenses/MIT"
              >{{ $t('terms.mitLicense') }}</a
            >.
          </p>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="flex items-center gap-3">
            <i class="pi pi-check-square"></i>
            {{ $t('terms.guidelinesTitle') }}
          </h2>
          <ul class="list-none m-0 p-0 flex flex-col gap-2">
            <li class="flex items-start gap-3">
              <i class="pi pi-check mt-1"></i>
              <span>{{ $t('terms.guideline1') }}</span>
            </li>
            <li class="flex items-start gap-3">
              <i class="pi pi-check mt-1"></i>
              <span>{{ $t('terms.guideline2') }}</span>
            </li>
            <li class="flex items-start gap-3">
              <i class="pi pi-check mt-1"></i>
              <span>{{ $t('terms.guideline3') }}</span>
            </li>
          </ul>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="flex items-center gap-3">
            <i class="pi pi-lock"></i>
            {{ $t('terms.restrictionsTitle') }}
          </h2>
          <ul class="list-none m-0 p-0 flex flex-col gap-2">
            <li class="flex items-start gap-3">
              <i class="pi pi-exclamation-circle mt-1"></i>
              <span>{{ $t('terms.restriction1') }}</span>
            </li>
            <li class="flex items-start gap-3">
              <i class="pi pi-exclamation-circle mt-1"></i>
              <span>{{ $t('terms.restriction2') }}</span>
            </li>
            <li class="flex items-start gap-3">
              <i class="pi pi-exclamation-circle mt-1"></i>
              <span>{{ $t('terms.restriction3') }}</span>
            </li>
          </ul>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="flex items-center gap-3">
            <i class="pi pi-shield"></i>
            {{ $t('terms.disclaimerTitle') }}
          </h2>
          <p class="m-0 italic border-l-4 pl-4 py-1">
            {{ $t('terms.disclaimerText') }}
          </p>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="flex items-center gap-3">
            <i class="pi pi-envelope"></i>
            {{ $t('terms.contactTitle') }}
          </h2>
          <p class="m-0">
            {{ $t('terms.contactText') }}
            <a
              :href="`mailto:${$t('terms.contactEmail')}`"
              >{{ $t('terms.contactEmail') }}</a
            >
          </p>
        </section>
      </div>

      <div class="mt-8 pt-8 border-t flex flex-col sm:flex-row justify-between items-center gap-4">
        <small>{{ $t('terms.lastUpdated') }}</small>
        <a
          href="https://github.com/1suo/cutkit"
          class="flex items-center gap-2"
        >
          <i class="pi pi-github"></i>
          {{ $t('terms.githubRepository') }}
        </a>
      </div>
    </div>
  </StandardPage>
</template>

<script setup>
import StandardPage from '~/components/shared/StandardPage.vue';

definePageMeta({
  layout: "app",
});
</script>
