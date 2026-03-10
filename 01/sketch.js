let system;
let bgImage;
let fixData = null; // fix.jsonの内容を格納
let particleStep = 1; // パーティクルステップ（Tweakpaneで調整可能）
let particlePane; // パーティクル用のTweakpane
let particleColors = {
  color1: '#ffffff', // 色1
  color2: '#c1c3b0', // 色2
  color3: '#0000ff', // 色3
  color4: '#31310f'  // 色4
};

// titleタグに適用されるストロークの色（ここで変更できます）
window.titleStrokeColor = '#81f55eff'; // 例: 少し明るい緑色など。自由に後で書き換えてください。
// titleタグに適用されるストロークの太さ（ここで変更できます）
window.titleStrokeWeight = 0;

function preload() {
  bgImage = loadImage('bg.png');
}

function setup() {
  let c = createCanvas(210 * 3, 297 * 3);
  c.id('main-canvas');
  background(0);

  system = new DesignSystem();
  c.drop((file) => system.handleFileDrop(file, mouseX, mouseY));

  // fix.jsonを読み込んでDesignSystemに反映
  fetch('fix.json')
    .then(response => response.json())
    .then(data => {
      fixData = data;
      console.log('fix.jsonの内容:', data);
      // DesignSystemにJSONデータをインポート
      system.importJSON(data);
    })
    .catch(error => {
      console.error('fix.jsonの読み込みに失敗:', error);
    });

  // ★パーティクルステップ用のTweakpaneを作成
  particlePane = new Tweakpane.Pane({
    title: 'Particle Settings',
    expanded: true
  });

  // パラメータオブジェクトを作成（参照を保持するため）
  const particleParams = {
    particleStep: particleStep
  };

  particlePane.addInput(particleParams, 'particleStep', {
    min: 0.5,
    max: 10,
    step: 0.1,
    label: 'Particle Step'
  }).on('change', (ev) => {
    particleStep = ev.value;
    console.log('Particle step changed to:', particleStep);
  });

  // ★4色のカラーピッカーを追加
  particlePane.addInput(particleColors, 'color1', { label: 'Color 1' }).on('change', () => {
    saveParticleColors();
  });
  particlePane.addInput(particleColors, 'color2', { label: 'Color 2' }).on('change', () => {
    saveParticleColors();
  });
  particlePane.addInput(particleColors, 'color3', { label: 'Color 3' }).on('change', () => {
    saveParticleColors();
  });
  particlePane.addInput(particleColors, 'color4', { label: 'Color 4' }).on('change', () => {
    saveParticleColors();
  });

  // ローカルストレージからカラー設定を読み込む
  loadParticleColors();
}


function draw() {
  // --- Outside: 全体の環境 ---
  background(system.backgroundColor);

  // --- System: 基本レンダリング ---
  system.render();

  // --- Inside: パーティクル表現（Tagが'particle' または 'title'  の要素） ---
  const drawParticleInside = (ctx) => {
    // stepパラメータ（Tweakpaneで調整可能）
    const PARTICLE_STEP = particleStep;

    // A. データの初期化（変更検知付き）
    // stepが変わった場合も再初期化が必要
    // 浮動小数点の比較を避けるため、差の絶対値で判定
    const stepChanged = ctx.state.lastStep === undefined ||
      Math.abs(ctx.state.lastStep - PARTICLE_STEP) > 0.01;

    // ★重要: elementChanged()は要素のversionが変わった時（フォントサイズなどが変更された時）にtrueを返す
    // stepChangedはparticleStepが変わった時にtrueを返す
    const needsReinit = !ctx.state.init || ctx.elementChanged() || stepChanged;

    // デバッグ用: 再初期化が必要な場合のみログを出力
    if (needsReinit && stepChanged) {
      console.log('Step changed detected:', ctx.state.lastStep, '->', PARTICLE_STEP);
    }

    if (needsReinit) {
      console.log('Reinitializing particles with step:', PARTICLE_STEP); // デバッグ用

      // ★★★【追加】キャッシュを強制的にクリアする ★★★
      // これをしないと、ライブラリは「形が変わってないから計算しなくていいや」と判断して
      // 古い（前のstepの）点データを返してしまいます。
      ctx.element._cachedPoints = null;

      // その後に getPoints を呼ぶと、新しい step で再計算してくれます
      // getPointsを一度だけ取得（毎フレームは禁止）
      ctx.state.points = ctx.element.getPoints ? ctx.element.getPoints(PARTICLE_STEP) : [];
      ctx.state.particles = [];
      console.log('Generated points:', ctx.state.points.length); // デバッグ用


      // 各点をパーティクルとして初期化
      for (let i = 0; i < ctx.state.points.length; i++) {
        const pt = ctx.state.points[i];
        // 4種類の色からランダムに選択
        const colorIndex = floor(random(4));
        const baseSize = random(5, 20); // ベースサイズ
        ctx.state.particles.push({
          baseX: pt.x,
          baseY: pt.y,
          x: pt.x,
          y: pt.y,
          vx: 0,
          vy: 0,
          life: 1.0,
          baseSize: baseSize, // ベースサイズを保存
          size: baseSize, // 現在のサイズ
          colorIndex: colorIndex, // 色のインデックスを保存
          animationOffset: random(TWO_PI) // アニメーションのオフセット（各パーティクルで異なるタイミング）
        });
      }

      ctx.state.init = true;
      ctx.state.lastStep = PARTICLE_STEP;
      // ★重要: 要素のversionを記録（フォントサイズなどの変更を検知するため）
      ctx.markAsProcessed();
    }

    // B. パーティクルの更新と描画
    // ★安全性チェック：particlesが存在しない場合は空配列を使用
    const particles = ctx.state.particles || [];

    // 4種類の色を定義（Tweakpaneで調整可能）
    // カラーコード（#RRGGBB）をRGB配列に変換
    const hexToRgb = (hex) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
      ] : [255, 255, 255];
    };

    const colors = [
      hexToRgb(particleColors.color1),
      hexToRgb(particleColors.color2),
      hexToRgb(particleColors.color3),
      hexToRgb(particleColors.color4)
    ];

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // パーティクルのサイズアニメーション（大きくなったり小さくなったり）
      const animationSpeed = 0.01; // アニメーション速度
      const sizeVariation = 10; // サイズの変化幅
      const time = frameCount * animationSpeed + (p.animationOffset || 0);
      const sizeOffset = sin(time) * sizeVariation;
      const animatedSize = (p.baseSize || p.size || 10) + sizeOffset;

      // パーティクルを描画
      const alpha = ctx.element.opacity * 255 * p.life;
      // パーティクルの色インデックスに応じた色を使用
      const colorIndex = p.colorIndex !== undefined ? p.colorIndex : 0;
      const [pr, pg, pb] = colors[colorIndex];
      fill(pr, pg, pb, alpha);
      // アウトラインを設定
      const tagStr = (ctx.element.tag || '').toString().toLowerCase();

      // titleタグ等へのパーティクル適用は別処理にするため、
      // ここでは particle タグ用のストローク（もしあれば）のみを適用する。
      // ※現状は特に設定なしでも構いませんが元のコードのまま緑にする場合は残す
      if (tagStr.indexOf('particle') !== -1) {
        stroke('#81f55eff'); // ユーザー指定の緑色
        strokeWeight(ctx.element.strokeWeight !== undefined ? ctx.element.strokeWeight : 0);
      } else {
        noStroke();
      }
      circle(p.x, p.y, animatedSize);
    }

    // C.元の要素も描画（オプション：Show OriginalがONの場合）
    // drawAutoは使わず、パーティクルだけで表現する
  };

  system.drawInside('particle', drawParticleInside);

  // 背景画像を描画（テスト用に一番手前に表示）
  if (bgImage) {
    image(bgImage, 0, 0, width, height);
  }
}

// ★パーティクルカラー設定をローカルストレージに保存
function saveParticleColors() {
  try {
    localStorage.setItem('particleColors', JSON.stringify(particleColors));
    console.log('Particle colors saved:', particleColors);
  } catch (err) {
    console.error('Failed to save particle colors:', err);
  }
}

// ★パーティクルカラー設定をローカルストレージから読み込む
function loadParticleColors() {
  try {
    const saved = localStorage.getItem('particleColors');
    if (saved) {
      const loaded = JSON.parse(saved);
      // 読み込んだ値を適用
      if (loaded.color1) particleColors.color1 = loaded.color1;
      if (loaded.color2) particleColors.color2 = loaded.color2;
      if (loaded.color3) particleColors.color3 = loaded.color3;
      if (loaded.color4) particleColors.color4 = loaded.color4;
      // Tweakpaneを更新
      particlePane.refresh();
      console.log('Particle colors loaded:', particleColors);
    }
  } catch (err) {
    console.error('Failed to load particle colors:', err);
  }
}