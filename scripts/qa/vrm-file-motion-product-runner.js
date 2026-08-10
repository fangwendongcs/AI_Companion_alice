async (page) => {
  const outputDir = 'output/playwright/vrm-file-motion-product';
  const wait = (ms) => page.waitForTimeout(ms);
  const cases = [
    { id: 'idle', assetId: 'fbxStandingIdle', type: 'state', settleMs: 900 },
    { id: 'intro', assetId: 'fbxWaving', type: 'slot', settleMs: 350 },
    { id: 'listening', assetId: 'fbxStandingIdle', type: 'state', settleMs: 900 },
    { id: 'thinking', assetId: 'fbxThinking', type: 'state', settleMs: 900 },
    { id: 'speaking', assetId: 'fbxTalking1', type: 'state', settleMs: 900 },
    { id: 'chat', assetId: 'fbxTalking', type: 'slot', settleMs: 700 },
    { id: 'wave', assetId: 'fbxWaving', type: 'intent', settleMs: 350 }
  ];

  await page.waitForFunction(() => {
    const app = window.__aliceApp;
    return Boolean(app?.state?.avatar?.loaded || app?.state?.modelLoaded);
  }, { timeout: 30000 });

  await page.evaluate(() => {
    window.__aliceApp?.patchState?.({ isMuted: true }, 'qa:file-motion-product');
    document.getElementById('sidePanel')?.classList.remove('show');
    document.querySelector('.debug-panel')?.classList.add('collapsed');
  });

  const read = async (label) => page.evaluate((label) => {
    const app = window.__aliceApp;
    app?.syncMotionDebugState?.({ force: true });
    const motion = app?.state?.motion || {};
    const vrm = app?.characterManager?.current?.avatar?.userData?.vrm || null;
    const humanoid = vrm?.humanoid || null;
    const boneNames = ['hips', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot'];
    const bones = Object.fromEntries(boneNames.map((boneName) => {
      const node = humanoid?.getNormalizedBoneNode?.(boneName) || humanoid?.getRawBoneNode?.(boneName) || null;
      if (!node) return [boneName, null];
      return [boneName, {
        position: [node.position.x, node.position.y, node.position.z].map((value) => Number(value.toFixed(6))),
        quaternion: [node.quaternion.x, node.quaternion.y, node.quaternion.z, node.quaternion.w]
          .map((value) => Number(value.toFixed(6)))
      }];
    }));
    return {
      label,
      current: motion.current || null,
      assetId: motion.assetId || '',
      layer: motion.layer || '',
      mode: motion.mode || null,
      format: motion.format || '',
      source: motion.source || null,
      quality: motion.qualityStatus || null,
      assetQuality: motion.assetQualityStatus || null,
      technical: motion.technicalStatus || null,
      product: motion.productStatus || null,
      license: motion.licenseStatus || null,
      qaOnly: Boolean(motion.qaOnly),
      proceduralActive: Boolean(motion.proceduralActive),
      trackCount: motion.trackCount ?? null,
      originalTrackCount: motion.originalTrackCount ?? null,
      retargetStatus: motion.retargetStatus || '',
      retargetMatchedTrackCount: motion.retargetMatchedTrackCount ?? null,
      retargetMatchedBoneCount: motion.retargetMatchedBoneCount ?? null,
      intent: motion.intent || null,
      intentStatus: motion.intentStatus || null,
      resolved: motion.resolvedMotion || null,
      fallback: motion.fallbackReason || '',
      fallbackFrom: motion.fallbackFrom || '',
      lastError: motion.lastError || '',
      bones
    };
  }, label);

  const assertions = [];
  const assert = (name, ok, detail = '') => assertions.push({ name, ok: Boolean(ok), detail });
  const records = [];
  const screenshots = [];
  const delta = (left, right) => {
    if (!left || !right) return Infinity;
    const values = [...left.position, ...left.quaternion];
    const reference = [...right.position, ...right.quaternion];
    return Math.max(...values.map((value, index) => Math.abs(value - reference[index])));
  };
  const waitForCurrent = async (id, label, timeoutMs = 10000) => {
    const startedAt = Date.now();
    let latest = await read(label);
    while (latest.current !== id && Date.now() - startedAt < timeoutMs) {
      await wait(200);
      latest = await read(label);
    }
    return latest;
  };

  await page.evaluate(() => {
    window.__aliceApp?.motionManager?.setState?.('idle');
    window.__aliceApp?.syncMotionDebugState?.({ force: true });
  });
  await wait(900);
  const baseline = await waitForCurrent('idle', 'idle:active');
  records.push(baseline);

  for (const testCase of cases) {
    if (testCase.id !== 'idle') {
      const accepted = await page.evaluate((entry) => {
        const app = window.__aliceApp;
        let ok = false;
        if (entry.type === 'state') ok = app?.motionManager?.setState?.(entry.id);
        if (entry.type === 'slot') {
          ok = app?.motionManager?.requestSlot?.(entry.id, {
            replacePending: true,
            transitionState: false
          });
        }
        if (entry.type === 'intent') {
          ok = app?.motionManager?.requestIntent?.('interaction.greeting', {
            part: 'arm',
            replacePending: true
          });
        }
        app?.syncMotionDebugState?.({ force: true });
        return Boolean(ok);
      }, testCase);
      assert(`${testCase.id} request accepted`, accepted, String(accepted));
      await wait(testCase.settleMs);
    }

    const record = await waitForCurrent(testCase.id, `${testCase.id}:active`);
    records.push(record);
    const screenshotPath = `${outputDir}/${testCase.id}.png`;
    await page.screenshot({ path: screenshotPath, scale: 'css', type: 'png' });
    screenshots.push(screenshotPath);

    assert(`${testCase.id} uses expected file asset`,
      record.current === testCase.id
        && record.assetId === testCase.assetId
        && record.source === 'file'
        && record.mode === 'retargeted'
        && record.format === 'fbx',
      JSON.stringify(record));
    assert(`${testCase.id} is a formal calibrated slot`,
      record.quality === 'approved'
        && record.technical === 'playable'
        && record.product === 'approved'
        && record.qaOnly === false,
      JSON.stringify(record));
    assert(`${testCase.id} filters the raw FBX tracks`,
      Number(record.trackCount) > 0
        && Number(record.originalTrackCount) > Number(record.trackCount)
        && Number(record.retargetMatchedTrackCount) > 0,
      JSON.stringify(record));
    assert(`${testCase.id} does not run a procedural substitute`,
      record.proceduralActive === false,
      JSON.stringify(record));
    assert(`${testCase.id} leaves hips and legs on the stable base pose`,
      Object.keys(baseline.bones).every((boneName) => delta(record.bones[boneName], baseline.bones[boneName]) <= 0.00001),
      JSON.stringify({ baseline: baseline.bones, actual: record.bones }));

    if (testCase.type === 'intent') {
      assert('greeting intent resolves directly to file-backed wave',
        record.intent === 'interaction.greeting'
          && record.intentStatus === 'accepted'
          && record.resolved === 'wave'
          && record.fallback === ''
          && record.fallbackFrom === '',
        JSON.stringify(record));
    }
  }

  await page.evaluate(() => {
    window.__aliceApp?.motionManager?.setState?.('idle');
    window.__aliceApp?.syncMotionDebugState?.({ force: true });
  });
  await wait(900);
  const final = await waitForCurrent('idle', 'final:idle');
  records.push(final);
  const finalPath = `${outputDir}/final-idle.png`;
  await page.screenshot({ path: finalPath, scale: 'css', type: 'png' });
  screenshots.push(finalPath);
  assert('final state returns to file-backed idle',
    final.current === 'idle'
      && final.assetId === 'fbxStandingIdle'
      && final.source === 'file'
      && final.proceduralActive === false,
    JSON.stringify(final));

  return {
    screenshots,
    records,
    assertions,
    ok: assertions.every((item) => item.ok)
  };
}
