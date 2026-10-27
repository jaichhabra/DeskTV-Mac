import { desk, report } from '../api';
import { isAvailable, useDeskContext } from '../context';
import { ActionTile, AppTile } from '../components/Tiles';
import { Grid } from './Grid';
import { Sheet } from './Sheet';

/** Every app: the ones on this Mac first, then hidden or not installed ones; hold OK on one for its menu. */
export function AppsSheet() {
  const d = useDeskContext();
  const c = d.config;
  const ready = c.apps.filter((a) => !a.hidden && isAvailable(c, a));
  const others = c.apps.filter((a) => a.hidden || !isAvailable(c, a));
  const ids = ready.map((a) => a.id);
  return (
    <Sheet scope="apps" title="All Apps" aside={<span className="sheet-hint">Hold OK on an app to pin, move, edit or hide it</span>}>
      <Grid>
        {[
          ...ready.map((a) => <AppTile key={a.id} app={a} list={ids} variant="grid" />),
          <ActionTile key="add" keyName="apps:add" label="Add an App" glyph="plus" onClick={() => d.editApp(null)} />,
          <ActionTile
            key="refresh"
            keyName="apps:refresh"
            label="Find Installed Apps"
            glyph="refresh"
            onClick={() =>
              desk.installedApps(true).then(async () => {
                await d.save((x) => x);
                d.toast('Updated the list of installed apps');
              }, report)
            }
          />
        ]}
      </Grid>
      {others.length > 0 && (
        <>
          <h2 className="sheet-section">Hidden or not installed</h2>
          <Grid>{others.map((a) => <AppTile key={a.id} app={a} list={[]} variant="grid" />)}</Grid>
        </>
      )}
    </Sheet>
  );
}
