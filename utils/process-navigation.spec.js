import { describe, expect, it } from 'vitest';
import { composeEffectiveScreens, defaultHomeScreen, processOperationalScreens, resolveDefaultHomeScreen, resolveProcessEntryRoute, resolveVisibleScreens } from './process-navigation.js';

describe('process navigation', () => {
  it('keeps assignment-scoped screens visible when the matching scoped grant exists', () => {
    const screens = [{
      id: 'assigned_project',
      required: {
        feature: 'projects',
        level: 'read',
        scope: { instanceId: 'project-123' }
      }
    }];
    const permissions = {
      projects: [{ level: 'read', scope: { instanceId: 'project-123' } }]
    };

    expect(resolveVisibleScreens(screens, permissions)).toHaveLength(1);
  });

  it('hides assignment-scoped screens when the scoped grant points elsewhere', () => {
    const screens = [{
      id: 'assigned_project',
      required: {
        feature: 'projects',
        level: 'read',
        scope: { instanceId: 'project-123' }
      }
    }];
    const permissions = {
      projects: [{ level: 'read', scope: { instanceId: 'project-456' } }]
    };

    expect(resolveVisibleScreens(screens, permissions)).toEqual([]);
  });

  it('keeps status-conditioned screens visible before an entity context exists', () => {
    const screens = [{
      id: 'new_projects',
      required: {
        feature: 'projects',
        level: 'admin',
        rule: { fact: 'primaryState', equals: 'NEW' }
      }
    }];
    const permissions = {
      projects: [{ level: 'admin', rule: { fact: 'primaryState', equals: 'NEW' } }]
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
        rule: { fact: 'primaryState', equals: 'READY' }
      },
      sources: [{
        id: 'cassette',
        typeId: 'cassette',
        mode: 'list',
        required: {
          feature: 'cassettes',
          level: 'read',
          rule: { fact: 'primaryState', equals: 'READY' }
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
        rule: { fact: 'primaryState', equals: 'ACTIVE' }
      },
      sources: [{
        id: 'cassette',
        typeId: 'cassette',
        mode: 'list',
        required: {
          feature: 'cassettes',
          level: 'read',
          rule: { fact: 'primaryState', equals: 'ACTIVE' }
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
            { fact: 'primaryState', equals: 'READY' },
            { fact: 'primaryState', equals: 'ACTIVE' }
          ]
        }
      }
    });
    expect(effective[0].sources[0].required.rule.any).toEqual([
      { fact: 'primaryState', equals: 'READY' },
      { fact: 'primaryState', equals: 'ACTIVE' }
    ]);
  });

  it('uses generated process home as the authenticated entry route', () => {
    expect(resolveProcessEntryRoute({
      screens: [{
        id: 'home_user',
        screenKey: 'home_user',
        route: '/home',
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
    })).toBe('/home');
  });

  it('does not use legacy project route for active processes without project screens', () => {
    expect(resolveProcessEntryRoute({
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
      screens: [{
        id: 'organization_overview',
        screenKey: 'organization_overview',
        route: '/organization',
        template: 'organizationOverview',
        placement: 'hub',
        kind: 'system'
      }]
    })).toBe(defaultHomeScreen().route);
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

  it('falls back to the default home route without an active process', () => {
    expect(resolveProcessEntryRoute({
      screens: [{
        route: '/home',
        template: 'home'
      }]
    })).toBe('/home');
    expect(resolveProcessEntryRoute({
      screens: [{
        route: '/organization',
        template: 'organizationOverview',
        kind: 'system'
      }]
    })).toBe('/home');
  });

  it('resolves the compiled home screen as the default, the sourceless contract otherwise', () => {
    const compiledHome = {
      id: 'home_user',
      screenKey: 'home_user',
      route: '/home',
      template: 'home',
      placement: 'home'
    };
    expect(resolveDefaultHomeScreen([compiledHome])).toEqual(compiledHome);
    expect(resolveDefaultHomeScreen([])).toEqual(defaultHomeScreen());
    expect(defaultHomeScreen()).toMatchObject({
      screenKey: 'home',
      template: 'home',
      route: '/home',
      sources: [],
      regions: [],
      actions: []
    });
  });
});
