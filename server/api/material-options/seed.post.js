import { defineEventHandler } from 'h3';
import * as materialOptionsService from '~/server/features/material-options/service';

export default defineEventHandler(async (event) => {
  await materialOptionsService.seed();
  return { success: true };
});
