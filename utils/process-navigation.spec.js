import { describe, expect, it } from 'vitest';
import { composeEffectiveScreens, processOperationalScreens, resolveProcessEntryRoute, resolveVisibleScreens } from './process-navigation.js';

describe('process navigation', () => {
  it('keeps assignment-scoped screens visible when the matching scoped grant exists', () => {
    const screens = [{
      id: 'assigned_project',
      required: {
        feature: 'projects',
        level: 'read',
        scope: { entityId: 'project-123' }
      }
    }];
    const permissions = {
      projects: [{ level: 'read', scope: { entityId: 'project-123' } }]
    };

    expect(resolveVisibleScreens(screens, permissions)).toHaveLength(1);
  });

  it('hides assignment-scoped screens when the scoped grant points elsewhere', () => {
    const screens = [{
      id: 'assigned_project',
      required: {
        feature: 'projects',
        level: 'read',
        scope: { entityId: 'project-123' }
      }
    }];
    const permissions = {
      projects: [{ level: 'read', scope: { entityId: 'project-456' } }]
    };

    expect(resolveVisibleScreens(screens, permissions)).toEqual([]);
  });

  it('keeps status-conditioned screens visible before an entity context exists', () => {
    const screens = [{
      id: 'new_projects',
      required: {
        feature: 'projects',
        level: 'admin',
        rule: { fact: 'primaryStatus', equals: 'NEW' }
      }
    }];
    const permissions = {
      projects: [{ level: 'admin', rule: { fact: 'primaryStatus', equals: 'NEW' } }]
    };

    expect(resolveVisibleScreens(screens, permissions)).toHaveLength(1);
  });

  it('composes duplicate generated role screens into one effective entity screen', () => {
    const screens = [{
      id: 'auto_role_reader_cassette',
      screenKey: 'auto_role_reader_cassette',
      route: '/screens/auto_role_reader_cassette',
      template: 'typeList',
      typeId: 'cassette',
      required: {
        feature: 'cassettes',
        level: 'read',
        rule: { fact: 'primaryStatus', equals: 'READY' }
      },
      sources: [{
        id: 'cassette',
        typeId: 'cassette',
        mode: 'list',
        required: {
          feature: 'cassettes',
          level: 'read',
          rule: { fact: 'primaryStatus', equals: 'READY' }
        }
      }]
    }, {
      id: 'auto_role_admin_cassette',
      screenKey: 'auto_role_admin_cassette',
      route: '/screens/auto_role_admin_cassette',
      template: 'typeList',
      typeId: 'cassette',
      required: {
        feature: 'cassettes',
        level: 'read',
        rule: { fact: 'primaryStatus', equals: 'ACTIVE' }
      },
      sources: [{
        id: 'cassette',
        typeId: 'cassette',
        mode: 'list',
        required: {
          feature: 'cassettes',
          level: 'read',
          rule: { fact: 'primaryStatus', equals: 'ACTIVE' }
        }
      }],
      actions: ['create_cassette']
    }];

    const effective = composeEffectiveScreens(screens);

    expect(effective).toHaveLength(1);
    expect(effective[0]).toMatchObject({
      screenKey: 'auto_cassette',
      route: '/screens/auto_cassette',
      actions: ['create_cassette'],
      required: {
        feature: 'cassettes',
        level: 'read',
        rule: {
          any: [
            { fact: 'primaryStatus', equals: 'READY' },
            { fact: 'primaryStatus', equals: 'ACTIVE' }
          ]
        }
      }
    });
    expect(effective[0].sources[0].required.rule.any).toEqual([
      { fact: 'primaryStatus', equals: 'READY' },
      { fact: 'primaryStatus', equals: 'ACTIVE' }
    ]);
  });

  it('uses generated process home as the authenticated entry route', () => {
    expect(resolveProcessEntryRoute({
      processActive: true,
      screens: [{
        id: 'home_user',
        screenKey: 'home_user',
        route: '/screens/home_user',
        template: 'home',
        placement: 'home'
      }, {
        id: 'auto_cassette',
        screenKey: 'auto_cassette',
        route: '/screens/auto_cassette',
        template: 'typeList',
        placement: 'hub',
        typeId: 'cassette'
      }]
    })).toBe('/screens/home_user');
  });

  it('does not use legacy project route for active processes without project screens', () => {
    expect(resolveProcessEntryRoute({
      processActive: true,
      screens: [{
        id: 'auto_queue',
        screenKey: 'auto_queue',
        route: '/screens/auto_queue',
        template: 'typeList',
        placement: 'hub',
        typeId: 'queue'
      }]
    })).toBe('/screens/auto_queue');
  });

  it('ignores organization system screens when choosing the active process entry route', () => {
    expect(resolveProcessEntryRoute({
      processActive: true,
      screens: [{
        id: 'organization_overview',
        screenKey: 'organization_overview',
        route: '/organization',
        template: 'organizationOverview',
        placement: 'hub',
        kind: 'system'
      }]
    })).toBe('/screens');
  });

  it('keeps only operational generated screens in process mode hub lists', () => {
    expect(processOperationalScreens([{
      id: 'organization_overview',
      screenKey: 'organization_overview',
      route: '/organization',
      template: 'organizationOverview',
      placement: 'hub',
      kind: 'system'
    }, {
      id: 'auto_cassette',
      screenKey: 'auto_cassette',
      route: '/screens/auto_cassette',
      template: 'typeList',
      placement: 'hub',
      typeId: 'cassette'
    }]).map(screen => screen.screenKey)).toEqual(['auto_cassette']);
  });

  it('returns no process route when there is no active process', () => {
    expect(resolveProcessEntryRoute({
      processActive: false,
      screens: [{
        route: '/screens/home_user',
        template: 'home'
      }]
    })).toBeNull();
  });
});
