let system;
let fixData = null; // fix.jsonの内容を格納
let balls = []; // ブロック崩しのボール
let particleStep = 4; // パーティクルステップ（Tweakpaneで調整可能）
let particlePane; // パーティクル用のTweakpane
let particleColors = {
  color1: '#ffffff', // 色1（白）
  color2: '#00ff00', // 色2（緑）
  color3: '#0000ff', // 色3（青）
  color4: '#ffff00'  // 色4（黄）
};

function setup() {
  let c = createCanvas(210*3, 297*3);
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
  
  // ボールを2個初期化
  // 全てのボールの速度を同じにする（速さは3、方向はランダム）
  const speed = 3;
  for (let i = 0; i < 0; i++) {
    const angle = random(TWO_PI); // ランダムな方向
    balls.push({
      x: random(50, width - 50),
      y: random(50, height - 50),
      vx: cos(angle) * speed,
      vy: sin(angle) * speed,
      radius: 15,
      color: [random(100, 255), random(100, 255), random(100, 255)]
    });
  }
}


function draw() {
  // --- Outside: 全体の環境 ---
  background(system.backgroundColor);
  
  // --- System: 基本レンダリング ---
  system.render();
  
  // --- Inside: パーティクル表現（Tagが'particle'の要素） ---
  system.drawInside('particle', (ctx) => {
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
    
    // マウスとの距離に応じた反発力
    const mouseInfluenceRadius = 0;
    const mouseInfluenceStrength = 1;
    
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      
      // マウスとの距離を計算
      const dx = ctx.mouseX - p.x;
      const dy = ctx.mouseY - p.y;
      const dist = sqrt(dx * dx + dy * dy);
      
      // マウスが近い場合、反発力を適用
      if (dist < mouseInfluenceRadius && dist > 0) {
        const force = (mouseInfluenceRadius - dist) / mouseInfluenceRadius;
        const angle = atan2(dy, dx);
        p.vx += cos(angle) * force * mouseInfluenceStrength;
        p.vy += sin(angle) * force * mouseInfluenceStrength;
      }
      
      // ★ボールとの距離に応じた反発力
      const ballInfluenceRadius = 5;
      const ballInfluenceStrength = 1;
      
      for (let ball of balls) {
        // ボールのグローバル座標を要素のローカル座標に変換
        const ballDx = ball.x - ctx.element.x;
        const ballDy = ball.y - ctx.element.y;
        const cosA = cos(-ctx.element.angle);
        const sinA = sin(-ctx.element.angle);
        const localBallX = (ballDx * cosA - ballDy * sinA) / ctx.element.scale;
        const localBallY = (ballDx * sinA + ballDy * cosA) / ctx.element.scale;
        
        // パーティクルとボールの距離を計算
        const ballDxLocal = localBallX - p.x;
        const ballDyLocal = localBallY - p.y;
        const ballDist = sqrt(ballDxLocal * ballDxLocal + ballDyLocal * ballDyLocal);
        
        // ボールが近い場合、反発力を適用
        if (ballDist < ballInfluenceRadius && ballDist > 0) {
          const force = (ballInfluenceRadius - ballDist) / ballInfluenceRadius;
          const angle = atan2(ballDyLocal, ballDxLocal);
          p.vx += cos(angle) * force * ballInfluenceStrength;
          p.vy += sin(angle) * force * ballInfluenceStrength;
        }
      }
      
      // 元の位置に戻る力（スプリング）
      const springStrength = 0.05;
      p.vx += (p.baseX - p.x) * springStrength;
      p.vy += (p.baseY - p.y) * springStrength;
      
      // 減衰
      p.vx *= 0.9;
      p.vy *= 0.9;
      
      // 位置を更新
      p.x += p.vx;
      p.y += p.vy;
      
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
      stroke(0); // 黒色、半透明
      strokeWeight(0.2);
      circle(p.x, p.y, animatedSize);
    }
    
    // C. 元の要素も描画（オプション：Show OriginalがONの場合）
    // drawAutoは使わず、パーティクルだけで表現する
  });
  
  // --- Outside: ブロック崩しのボール（2個） ---
  for (let ball of balls) {
    // 位置を更新
    ball.x += ball.vx;
    ball.y += ball.vy;
    
    // 壁との衝突判定（左右の壁）
    if (ball.x - ball.radius <= 0 || ball.x + ball.radius >= width) {
      ball.vx *= -1;
      // 壁からはみ出さないように位置を修正
      ball.x = constrain(ball.x, ball.radius, width - ball.radius);
    }
    
    // 壁との衝突判定（上下の壁）
    if (ball.y - ball.radius <= 0 || ball.y + ball.radius >= height) {
      ball.vy *= -1;
      // 壁からはみ出さないように位置を修正
      ball.y = constrain(ball.y, ball.radius, height - ball.radius);
    }
    
    // ボールを描画
    fill(ball.color[0], ball.color[1], ball.color[2]);
    noStroke();
    circle(ball.x, ball.y, ball.radius * 2);
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