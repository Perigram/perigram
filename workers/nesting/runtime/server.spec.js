import { describe, expect, it, vi } from 'vitest';
import { createRuntime } from './server.mjs';
import listing from '../listing.json';

describe('Nesting managed runtime', () => {
  it('declares browser and server execution for the graph operation', () => {
    const runtime = listing.declarations.runtimes.find(item => item.id === 'nesting-server');
    const service = listing.declarations.services.find(item => item.id === 'nesting-solve');
    expect(runtime.targets).toEqual(['browser', 'server']);
    expect(service.execution.targets).toEqual(['browser', 'server']);
    expect(service.palette.group).toBe('nesting');
  });

  it('solves generic polygon parts and preserves source metadata for consumers', async () => {
    const call = vi.fn(async (_name, request) => ({
      bins:[{id:0,shape:{data:{outer:[[0,0],[100,0],[100,100],[0,100],[0,0]],inner:[]}}}],
      solution:{density:0.5,layouts:[{container_id:0,placed_items:[{item_id:0}]}]}
    }));
    const result = await createRuntime().execute('nesting-solve',{
      items:[{sourceId:'source-1',sourceKey:'family',count:1,parts:[{
        coordinates:[[0,0],[10,0],[10,10],[0,10],[0,0]],handles:['A1'],sourceLayers:[{layer:'cut.outer'}]
      }]}],sheetWidth:100,sheetHeight:100,space:3
    },{capabilities:{call}});
    expect(call).toHaveBeenCalledWith('nesting.solve',expect.objectContaining({
      items:[expect.objectContaining({id:0,source_id:'source-1',count:1})],
      params:expect.objectContaining({width:100,height:100,space:3,sheetCount:1})
    }));
    expect(result.layouts[0].sourceItems[0]).toMatchObject({
      sourceId:'source-1',sourceKey:'family',handles:['A1'],sourceLayers:[{layer:'cut.outer'}]
    });
    expect(result.layouts[0].sheetPolygon.outer).toHaveLength(5);
    expect(result.summary).toMatchObject({efficiency:50,sheetCount:1,placedCount:1});
  });

  it('reads graph invocation inputs from the envelope and returns the value port', async () => {
    const call = vi.fn(async () => ({solution:{layouts:[]}}));
    const result = await createRuntime().execute('nesting-solve',{
      mode:'preview',
      config:{},
      inputs:{
        items:[{sourceId:'source-3',count:1,parts:[{coordinates:[[0,0],[10,0],[10,10],[0,10]]}]}],
        sheetWidth:100,
        sheetHeight:100,
        space:3
      }
    },{capabilities:{call}});
    expect(call).toHaveBeenCalledWith('nesting.solve',expect.objectContaining({
      items:[expect.objectContaining({source_id:'source-3'})]
    }));
    expect(result.value.layouts).toEqual([]);
  });

  it('reserves one worst-case sheet per physical polygon part, not per source design', async () => {
    const call = vi.fn(async (_name, request) => ({solution:{layouts:[]}}));
    await createRuntime().execute('nesting-solve',{
      items:[{sourceId:'source-2',count:2,parts:[
        {coordinates:[[0,0],[10,0],[10,10],[0,10]]},
        {coordinates:[[20,0],[30,0],[30,10],[20,10]]}
      ]}],sheetWidth:100,sheetHeight:100
    },{capabilities:{call}});
    expect(call.mock.calls[0][1].params.sheetCount).toBe(4);
  });

  it('rejects missing source identity and invalid quantities before solver dispatch', async () => {
    const call = vi.fn();
    const run = (items) => createRuntime().execute('nesting-solve',{items,sheetWidth:100,sheetHeight:100},{capabilities:{call}});
    await expect(run([{parts:[]}])).rejects.toThrow(/sourceId/);
    await expect(run([{sourceId:'x',count:1.5,parts:[{coordinates:[[0,0],[1,0],[1,1]]}]}])).rejects.toThrow(/positive safe integer/);
    expect(call).not.toHaveBeenCalled();
  });

  it('requires the platform host capability', async () => {
    await expect(createRuntime().execute('nesting-solve',{})).rejects.toThrow(/nesting.solve capability/);
  });
});
