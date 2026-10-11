# Transitional twin — doomed

The OCCS engine's single home is
[workers/facade/occs](../../workers/facade/occs/README.md) (the facade
plugin's executor serves it and the editor surface modules import it).
This copy exists only while the read-side preview family
(`DrawingCanvas` occs-cassette source, `GeneratedScreen`) still lives in
app code — M7 migrates them and M8 deletes this directory. No specs
here; the engine's specs run against the canonical home. Do not edit
this copy.
