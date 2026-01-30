<template>
    <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
            <label class="font-bold text-sm">Name</label>
            <InputText v-model="form.name" />
        </div>
        <div class="flex flex-col gap-2">
            <label class="font-bold text-sm">Email</label>
            <InputText v-model="form.email" type="email" />
        </div>
        <div class="flex flex-col gap-2" v-if="!editMode">
            <label class="font-bold text-sm">Password</label>
            <Password v-model="form.password" :feedback="false" toggleMask />
        </div>
        <div class="flex flex-col gap-2">
            <label class="font-bold text-sm">Role</label>
            <Select 
                v-model="form.role" 
                :options="roles" 
                :placeholder="$t('auth.selectRole')" 
            />
        </div>
        <div class="flex justify-end gap-2 mt-4">
            <Button :label="$t('common.cancel')" severity="secondary" text @click="$emit('cancel')" />
            <Button :label="editMode ? $t('common.update') : $t('common.create')" @click="handleSubmit" />
        </div>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Button from 'primevue/button';
import Select from 'primevue/select';

const props = defineProps({
    user: {
        type: Object,
        default: null
    }
});

const emit = defineEmits(['save', 'cancel']);

const editMode = computed(() => !!props.user);

const form = ref({
    name: props.user?.name || '',
    email: props.user?.email || '',
    password: '',
    role: props.user?.role || 'IndividualUser'
});

const roles = ['SuperAdmin', 'ManufacturerAdmin', 'ContractorAdmin', 'CustomerAdmin', 'IndividualUser'];

const handleSubmit = () => {
    emit('save', form.value);
};
</script>