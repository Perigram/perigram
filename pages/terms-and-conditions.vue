<template>
  <div class="max-w-4xl mx-auto p-6 bg-gray-50 text-gray-800 shadow-lg rounded-lg">
    <h1 class="text-3xl font-bold mb-4">{{ $t('terms.title') }}</h1>
    <p class="mb-4">
      {{ $t('terms.welcome') }}
    </p>
    <p class="mb-4">
      {{ $t('terms.agreement') }}
    </p>

    <h2 class="text-2xl font-semibold mt-6 mb-4">{{ $t('terms.philosophyTitle') }}</h2>
    <p class="mb-4">
      {{ $t('terms.philosophyText') }}
    </p>

    <h2 class="text-2xl font-semibold mt-6 mb-4">{{ $t('terms.licenseTitle') }}</h2>
    <p class="mb-4">
      {{ $t('terms.licenseText') }}
      <a
        href="https://opensource.org/licenses/MIT"
        class="text-blue-500 underline"
        >{{ $t('terms.mitLicense') }}</a
      >.
    </p>

    <h2 class="text-2xl font-semibold mt-6 mb-4">{{ $t('terms.guidelinesTitle') }}</h2>
    <ul class="list-disc pl-6 mb-4">
      <li>
        {{ $t('terms.guideline1') }}
      </li>
      <li>
        {{ $t('terms.guideline2') }}
      </li>
      <li>
        {{ $t('terms.guideline3') }}
      </li>
    </ul>

    <h2 class="text-2xl font-semibold mt-6 mb-4">{{ $t('terms.restrictionsTitle') }}</h2>
    <ul class="list-disc pl-6 mb-4">
      <li>
        {{ $t('terms.restriction1') }}
      </li>
      <li>
        {{ $t('terms.restriction2') }}
      </li>
      <li>
        {{ $t('terms.restriction3') }}
      </li>
    </ul>

    <h2 class="text-2xl font-semibold mt-6 mb-4">{{ $t('terms.disclaimerTitle') }}</h2>
    <p class="mb-4">
      {{ $t('terms.disclaimerText') }}
    </p>

    <h2 class="text-2xl font-semibold mt-6 mb-4">{{ $t('terms.contactTitle') }}</h2>
    <p class="mb-4">
      {{ $t('terms.contactText') }}
      <a
        :href="`mailto:${$t('terms.contactEmail')}`"
        class="text-blue-600 hover:underline"
        >{{ $t('terms.contactEmail') }}</a
      >
    </p>

    <p class="mt-8 text-sm text-gray-500">
      {{ $t('terms.lastUpdated') }}<br />
      <a
        href="https://github.com/1suo/cutkit"
        class="hover:underline"
        >{{ $t('terms.githubRepository') }}</a
      >
    </p>
  </div>
</template>

<script setup>
definePageMeta({
  layout: "doc",
});
</script>
