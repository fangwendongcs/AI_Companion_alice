async (page) => {
  const wait = (ms) => page.waitForTimeout(ms);

  await page.waitForFunction(() => {
    const app = window.__aliceApp;
    return Boolean(app?.state?.avatar?.loaded || app?.state?.modelLoaded);
  }, { timeout: 30000 });

  await page.evaluate(() => {
    window.__aliceApp?.patchState?.({ isMuted: true }, 'qa:motion-lifecycle');
    document.getElementById('sidePanel')?.classList.remove('show');
    document.querySelector('.debug-panel')?.classList.add('collapsed');
  });

  await page.waitForFunction(() => {
    const app = window.__aliceApp;
    app?.syncMotionDebugState?.({ force: true });
    return app?.state?.motion?.current === 'idle';
  }, { timeout: 30000 });

  const clickPoint = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.round(rect.x + rect.width * 0.57),
      y: Math.round(rect.y + rect.height * 0.45)
    };
  });

  const read = async (label) => page.evaluate((label) => {
    const app = window.__aliceApp;
    app?.syncMotionDebugState?.({ force: true });
    const motion = app?.state?.motion || {};
    const avatarId = app?.state?.avatar?.currentAvatarId || app?.state?.currentAvatarId || null;
    const queue = app?.motionManager?.controller?.queue?.snapshot?.() || {};
    const activeRequestCount = app?.motionManager?.controller?.activeRequests?.size || 0;
    return {
      label,
      avatarId,
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
      retargetProfile: motion.retargetProfile || '',
      proceduralActive: Boolean(motion.proceduralActive),
      intent: motion.intent || null,
      intentStatus: motion.intentStatus || null,
      resolved: motion.resolvedMotion || null,
      fallback: motion.fallbackReason || null,
      fallbackFrom: motion.fallbackFrom || null,
      lastError: motion.lastError || '',
      queue,
      activeRequestCount,
      suppressedActionId: app?.secondaryMotionSuppressedActionId || null,
      actions: (motion.activeActions || []).map((action) => ({
        name: action.name,
        layer: action.layer,
        mode: action.mode,
        format: action.format || '',
        source: action.source,
        quality: action.qualityStatus,
        product: action.productStatus || null,
        qaOnly: Boolean(action.qaOnly),
        weight: Number(action.weight || 0).toFixed(2),
        running: Boolean(action.running)
      }))
    };
  }, label);

  const activeOneShots = (record) => (record.actions || []).filter((action) => (
    ['gesture', 'fullBody'].includes(action.layer)
    && Number(action.weight) > 0.01
  ));
  const hasFullBodyAndGestureOverlap = (record) => {
    const oneShots = activeOneShots(record);
    return oneShots.some((action) => action.layer === 'fullBody')
      && oneShots.some((action) => action.layer === 'gesture');
  };
  const hasQueuedItems = (record) => Object.values(record.queue || {}).some((layer) => (
    Array.isArray(layer.queued) && layer.queued.length > 0
  ));
  const isIdleClean = (record) => (
    record.current === 'idle'
    && record.secondaryEnabled === true
    && record.suppressedActionId === null
    && activeOneShots(record).length === 0
    && Number(record.activeRequestCount || 0) === 0
    && !hasQueuedItems(record)
  );
  const assertions = [];
  const assert = (name, ok, detail = '') => {
    assertions.push({ name, ok: Boolean(ok), detail });
  };
  const waitForIdleClean = async (label, timeoutMs = 7000) => {
    const startedAt = Date.now();
    let latest = await read(label);
    while (!isIdleClean(latest) && Date.now() - startedAt < timeoutMs) {
      await wait(250);
      latest = await read(label);
    }
    return latest;
  };

  const records = [];
  records.push(await read('initial'));

  await page.evaluate(() => {
    window.__aliceApp?.motionManager?.requestIntent?.('interaction.greeting', {
      part: 'arm',
      replacePending: true
    });
    window.__aliceApp?.syncMotionDebugState?.({ force: true });
  });
  await wait(160);
  records.push(await read('greeting-intent-active'));
  records.push(await waitForIdleClean('greeting-intent-settled'));

  for (let index = 0; index < 3; index += 1) {
    await page.mouse.click(clickPoint.x, clickPoint.y);
    await wait(320);
    records.push(await read(`triple-click-${index + 1}`));
  }
  records.push(await waitForIdleClean('triple-click-settled'));

  await page.evaluate(() => {
    window.__aliceApp?.motionManager?.requestSlot?.('qaGreeting', {
      replacePending: true,
      transitionState: false
    });
    window.__aliceApp?.syncMotionDebugState?.({ force: true });
  });
  await wait(500);
  records.push(await read('qa-greeting-active-before-click'));
  await page.evaluate(() => {
    window.__aliceApp?.motionManager?.requestIntent?.('interaction.greeting', {
      part: 'arm',
      replacePending: true
    });
    window.__aliceApp?.syncMotionDebugState?.({ force: true });
  });
  await wait(450);
  records.push(await read('qa-greeting-active-after-click'));
  records.push(await waitForIdleClean('qa-greeting-click-settled', 10000));

  await page.evaluate(() => {
    window.__aliceApp?.motionManager?.requestSlot?.('qaGreeting', {
      replacePending: true,
      transitionState: false
    });
    window.__aliceApp?.syncMotionDebugState?.({ force: true });
  });
  await wait(500);
  records.push(await read('qa-greeting-active-before-intent'));
  await page.evaluate(() => {
    window.__aliceApp?.motionManager?.requestIntent?.('interaction.greeting', {
      part: 'arm',
      fallbackSlot: 'armTap',
      replacePending: true
    });
    window.__aliceApp?.syncMotionDebugState?.({ force: true });
  });
  await wait(320);
  records.push(await read('qa-greeting-intent-after-interrupt'));
  records.push(await waitForIdleClean('qa-greeting-intent-settled', 10000));

  await page.evaluate(() => {
    window.__aliceApp?.motionManager?.requestSlot?.('qaFbxStandingIdle', {
      replacePending: true,
      transitionState: false
    });
    window.__aliceApp?.syncMotionDebugState?.({ force: true });
  });
  await wait(600);
  records.push(await read('fbx-active-before-idle'));
  await page.evaluate(() => {
    window.__aliceApp?.motionManager?.setState?.('idle');
    window.__aliceApp?.syncMotionDebugState?.({ force: true });
  });
  await wait(900);
  records.push(await waitForIdleClean('fbx-cut-to-idle'));

  await page.evaluate(async () => {
    await window.__aliceApp?.requestAvatarSwitch?.('local_boy_vrm_test');
    window.__aliceApp?.syncMotionDebugState?.({ force: true });
  });
  records.push(await waitForIdleClean('switch-boy-settled'));

  await page.evaluate(async () => {
    await window.__aliceApp?.requestAvatarSwitch?.('local_girl_vrm_test');
    window.__aliceApp?.syncMotionDebugState?.({ force: true });
  });
  records.push(await waitForIdleClean('switch-girl-settled'));

  const missingAccepted = await page.evaluate(() => {
    const accepted = window.__aliceApp?.motionManager?.requestSlot?.('qaMissingMotionForFailureCheck', {
      replacePending: true,
      transitionState: false
    });
    window.__aliceApp?.syncMotionDebugState?.({ force: true });
    return Boolean(accepted);
  });
  await wait(200);
  const missingState = await read('missing-motion-request');
  records.push({ ...missingState, missingAccepted });

  const byLabel = Object.fromEntries(records.map((record) => [record.label, record]));
  assert(
    'initial idle is clean and file-backed',
    isIdleClean(byLabel.initial)
      && byLabel.initial.source === 'file'
      && byLabel.initial.format === 'fbx'
      && byLabel.initial.mode === 'retargeted'
      && byLabel.initial.qaOnly === false
      && byLabel.initial.proceduralActive === false,
    JSON.stringify(byLabel.initial)
  );
  assert(
    'greeting intent resolves to calibrated file wave',
    byLabel['greeting-intent-active'].intent === 'interaction.greeting'
      && byLabel['greeting-intent-active'].resolved === 'wave'
      && byLabel['greeting-intent-active'].source === 'file'
      && byLabel['greeting-intent-active'].format === 'fbx'
      && !byLabel['greeting-intent-active'].fallback
      && !byLabel['greeting-intent-active'].fallbackFrom,
    JSON.stringify(byLabel['greeting-intent-active'])
  );
  assert('greeting intent settles cleanly', isIdleClean(byLabel['greeting-intent-settled']), JSON.stringify(byLabel['greeting-intent-settled']));
  assert('triple click settles cleanly', isIdleClean(byLabel['triple-click-settled']), JSON.stringify(byLabel['triple-click-settled']));
  assert(
    'raw qa greeting starts as fullBody vrma with secondary suppress',
    byLabel['qa-greeting-active-before-click'].current === 'qaGreeting'
      && byLabel['qa-greeting-active-before-click'].mode === 'vrma'
      && byLabel['qa-greeting-active-before-click'].secondary === 'suppress'
      && byLabel['qa-greeting-active-before-click'].secondaryEnabled === false,
    JSON.stringify(byLabel['qa-greeting-active-before-click'])
  );
  assert(
    'click during raw qa greeting does not leave fullBody and gesture overlap',
    byLabel['qa-greeting-active-after-click'].current === 'wave'
      && byLabel['qa-greeting-active-after-click'].resolved === 'wave'
      && !hasFullBodyAndGestureOverlap(byLabel['qa-greeting-active-after-click']),
    JSON.stringify(byLabel['qa-greeting-active-after-click'])
  );
  assert('raw qa greeting interruption settles cleanly', isIdleClean(byLabel['qa-greeting-click-settled']), JSON.stringify(byLabel['qa-greeting-click-settled']));
  assert(
    'programmatic interaction intent interrupts fullBody without overlap',
    byLabel['qa-greeting-intent-after-interrupt'].current === 'wave'
      && byLabel['qa-greeting-intent-after-interrupt'].intent === 'interaction.greeting'
      && byLabel['qa-greeting-intent-after-interrupt'].resolved === 'wave'
      && byLabel['qa-greeting-intent-after-interrupt'].source === 'file'
      && !hasFullBodyAndGestureOverlap(byLabel['qa-greeting-intent-after-interrupt']),
    JSON.stringify(byLabel['qa-greeting-intent-after-interrupt'])
  );
  assert('programmatic greeting interrupt settles cleanly', isIdleClean(byLabel['qa-greeting-intent-settled']), JSON.stringify(byLabel['qa-greeting-intent-settled']));
  assert(
    'fbx enters retargeted debug-only path',
    byLabel['fbx-active-before-idle'].current === 'qaFbxStandingIdle'
      && byLabel['fbx-active-before-idle'].mode === 'retargeted'
      && byLabel['fbx-active-before-idle'].format === 'fbx'
      && byLabel['fbx-active-before-idle'].qaOnly === true
      && byLabel['fbx-active-before-idle'].technical === 'playableWithRetargetIssues',
    JSON.stringify(byLabel['fbx-active-before-idle'])
  );
  assert('fbx cut to idle settles cleanly', isIdleClean(byLabel['fbx-cut-to-idle']), JSON.stringify(byLabel['fbx-cut-to-idle']));
  assert('avatar switch to boy settles cleanly', isIdleClean(byLabel['switch-boy-settled']), JSON.stringify(byLabel['switch-boy-settled']));
  assert('avatar switch back to girl settles cleanly', isIdleClean(byLabel['switch-girl-settled']), JSON.stringify(byLabel['switch-girl-settled']));
  assert(
    'missing motion fails safely with debug error',
    missingAccepted === false
      && byLabel['missing-motion-request'].lastError === 'motion_not_registered:qaMissingMotionForFailureCheck'
      && isIdleClean(byLabel['missing-motion-request']),
    JSON.stringify(byLabel['missing-motion-request'])
  );

  await page.screenshot({
    path: 'output/playwright/vrm-motion-quality-v1-1/lifecycle-qa-final.png',
    scale: 'css',
    type: 'png'
  });

  return {
    clickPoint,
    records,
    assertions,
    ok: assertions.every((item) => item.ok)
  };
}
