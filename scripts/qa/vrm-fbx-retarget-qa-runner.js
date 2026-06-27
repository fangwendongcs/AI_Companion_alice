async (page) => {
  const outputDir = 'output/playwright/vrm-motion-quality-v1-1';
  const wait = (ms) => page.waitForTimeout(ms);
  const motions = [
    { id: 'qaFbxWaving', midMs: 160, lateMs: 320 },
    { id: 'qaFbxStandingIdle', midMs: 900, lateMs: 3000 },
    { id: 'qaFbxTalking', midMs: 900, lateMs: 2500 },
    { id: 'qaFbxTalking1', midMs: 900, lateMs: 2500 },
    { id: 'qaFbxTalking2', midMs: 900, lateMs: 2800 },
    { id: 'qaFbxThinking', midMs: 900, lateMs: 3000 }
  ];

  await page.waitForFunction(() => {
    const app = window.__aliceApp;
    return Boolean(app?.state?.avatar?.loaded || app?.state?.modelLoaded);
  }, { timeout: 30000 });

  await page.evaluate(() => {
    window.__aliceApp?.patchState?.({ isMuted: true }, 'qa:fbx-retarget');
    document.getElementById('sidePanel')?.classList.remove('show');
    document.querySelector('.debug-panel')?.classList.add('collapsed');
  });

  const read = async (label) => page.evaluate((label) => {
    const app = window.__aliceApp;
    app?.syncMotionDebugState?.({ force: true });
    const motion = app?.state?.motion || {};
    const activeRequestCount = app?.motionManager?.controller?.activeRequests?.size || 0;
    const queue = app?.motionManager?.controller?.queue?.snapshot?.() || {};
    return {
      label,
      current: motion.current || null,
      mode: motion.mode || null,
      format: motion.format || '',
      source: motion.source || null,
      quality: motion.qualityStatus || null,
      technical: motion.technicalStatus || null,
      product: motion.productStatus || null,
      license: motion.licenseStatus || null,
      qaOnly: Boolean(motion.qaOnly),
      secondary: motion.secondaryMotion || null,
      secondaryEnabled: motion.secondaryMotionEnabled,
      retarget: motion.retargetStatus || '',
      retargetProfile: motion.retargetProfile || '',
      retargetMatchedTrackCount: motion.retargetMatchedTrackCount ?? null,
      retargetMatchedBoneCount: motion.retargetMatchedBoneCount ?? null,
      proceduralActive: Boolean(motion.proceduralActive),
      activeRequestCount,
      queue,
      lastError: motion.lastError || '',
      actions: (motion.activeActions || []).map((action) => ({
        name: action.name,
        layer: action.layer,
        mode: action.mode,
        format: action.format || '',
        source: action.source,
        quality: action.qualityStatus,
        technical: action.technicalStatus || null,
        product: action.productStatus || null,
        license: action.licenseStatus || null,
        qaOnly: Boolean(action.qaOnly),
        secondaryMotion: action.secondaryMotion || '',
        weight: Number(action.weight || 0).toFixed(2),
        running: Boolean(action.running),
        time: Number(action.time || 0).toFixed(3)
      }))
    };
  }, label);

  const hasQueuedItems = (record) => Object.values(record.queue || {}).some((layer) => (
    Array.isArray(layer.queued) && layer.queued.length > 0
  ));
  const activeOneShots = (record) => (record.actions || []).filter((action) => (
    ['gesture', 'fullBody'].includes(action.layer)
    && Number(action.weight) > 0.01
  ));
  const isIdleClean = (record) => (
    record.current === 'idle'
    && record.secondaryEnabled === true
    && activeOneShots(record).length === 0
    && Number(record.activeRequestCount || 0) === 0
    && !hasQueuedItems(record)
  );
  const waitForIdleClean = async (label, timeoutMs = 9000) => {
    const startedAt = Date.now();
    let latest = await read(label);
    while (!isIdleClean(latest) && Date.now() - startedAt < timeoutMs) {
      await wait(250);
      latest = await read(label);
    }
    return latest;
  };

  const records = [];
  const screenshots = [];
  for (const motion of motions) {
    const accepted = await page.evaluate((motionId) => {
      const ok = window.__aliceApp?.motionManager?.requestSlot?.(motionId, {
        replacePending: true,
        transitionState: false
      });
      window.__aliceApp?.syncMotionDebugState?.({ force: true });
      return Boolean(ok);
    }, motion.id);
    records.push({ ...(await read(`${motion.id}:start`)), accepted });

    await wait(motion.midMs);
    const mid = await read(`${motion.id}:mid`);
    records.push(mid);
    const midPath = `${outputDir}/${motion.id}-mid.png`;
    await page.screenshot({ path: midPath, scale: 'css', type: 'png' });
    screenshots.push(midPath);

    await wait(Math.max(0, motion.lateMs - motion.midMs));
    const late = await read(`${motion.id}:late`);
    records.push(late);
    const latePath = `${outputDir}/${motion.id}-late.png`;
    await page.screenshot({ path: latePath, scale: 'css', type: 'png' });
    screenshots.push(latePath);

    const settled = await waitForIdleClean(`${motion.id}:settled`, 10000);
    records.push(settled);
  }

  const assertions = [];
  const assert = (name, ok, detail = '') => assertions.push({ name, ok: Boolean(ok), detail });
  motions.forEach((motion) => {
    const start = records.find((record) => record.label === `${motion.id}:start`);
    const mid = records.find((record) => record.label === `${motion.id}:mid`);
    const settled = records.find((record) => record.label === `${motion.id}:settled`);
    assert(`${motion.id} request accepted`, start?.accepted === true, JSON.stringify(start));
    assert(`${motion.id} enters retargeted fbx path`, mid?.current === motion.id && mid?.mode === 'retargeted' && mid?.format === 'fbx', JSON.stringify(mid));
    assert(`${motion.id} stays debugOnly/product debugOnly`, mid?.quality === 'debugOnly' && mid?.product === 'debugOnly', JSON.stringify(mid));
    assert(`${motion.id} suppresses procedural overlap`, mid?.proceduralActive === false, JSON.stringify(mid));
    assert(`${motion.id} returns to clean idle`, isIdleClean(settled), JSON.stringify(settled));
  });

  return {
    screenshots,
    records,
    assertions,
    ok: assertions.every((item) => item.ok),
    visualReviewRequired: 'Inspect screenshots manually for shoulder axis, arms, hips/root drift, scale, foot sliding, and idle return.'
  };
}
