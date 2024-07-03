let victoryDisplayed = false;

window.onload = function () {
    const introGif = document.getElementById('introGif');
    const contentContainer = document.getElementById('content-container');
    const userSection = document.getElementById('user-section');
    const waitingMessage = document.getElementById('waiting-message');
    const mainContent = document.getElementById('main-content');
    const introSound = new Audio('./Bgm/top.mp3'); // イントロGIFの効果音

    setTimeout(() => {
        introSound.play(); // 効果音を再生
        introGif.style.opacity = 1; // ふわっと表示
        setTimeout(() => {
            introGif.style.display = 'none';
            contentContainer.style.display = 'flex';
            userSection.style.display = 'flex';
            setTimeout(() => {
                contentContainer.style.opacity = 1;
            }, 100); // 適切な遅延を設定
        }, 1400); // 1.4秒後に画面を切り替える
    }, 100); // 0.1秒後にイントロGIFを表示する
};

let ws;
let user;
let userHP = new Map();

function connectWebSocket() {
    ws = new WebSocket('wss://gameoversquiz.onrender.com');

    ws.onopen = () => {
        console.log('Connected to WebSocket server');
        if (user) {
            ws.send(JSON.stringify({ type: 'register', user: user }));
        } else {
            console.error('User is not defined');
        }
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log('Received message from server:', message);

        if (message.type === 'readyToStart') {
            document.getElementById('waiting-message').style.display = 'none';
            hideSpinner(); // スピナーを非表示
            document.getElementById('match-found-message').style.display = 'block'; // 新しいメッセージを表示
            document.getElementById('state3-bgm').pause(); // 状態3のBGMを停止
            let state4Bgm = document.getElementById('state4-bgm');
            state4Bgm.volume = 0.2; // 音量を50%に設定
            state4Bgm.play();
            setTimeout(() => {
                document.getElementById('match-found-message').style.display = 'none';
                document.getElementById('main-content').classList.remove('hidden');
                document.getElementById('ready-message').style.display = 'block';
                showReadyImage();
                startCountdown();

                // 効果音を追加
                document.getElementById('your-new-sound').play();

                // 初期HPを表示
                updateHP(message.initialHP);
            }, 3000); // 3秒後にメインコンテンツを表示
        }

        if (message.type === 'startQuiz') {
            document.getElementById('ready-message').style.display = 'none';
            document.getElementById('quiz-section').style.display = 'block';
            document.getElementById('next-question').style.display = 'none'; // 初期は非表示
            document.getElementById('quiz').textContent = message.question;
            document.getElementById('example').textContent = message.example; // 例文を表示
            document.getElementById('responses').innerHTML = ''; // 回答ログをリセット
            document.getElementById('answer').value = ''; // 回答欄をリセット
            enableInput(); // 入力を有効化
        }
        if (message.type === 'answer') {
            const responseElement = document.createElement('p');
            responseElement.innerHTML = `<strong>${message.user}:</strong> ${message.answer}`;
            if (message.correct) {
                responseElement.classList.add('correct');
                disableInput(); // 正解したら入力を無効化
                if (!victoryDisplayed) {
                    document.getElementById('next-question').style.display = 'block'; // 正答後に表示
                }

                if (message.user === user) {
                    showAttack();
                } else {
                    showDamage();
                }
            } else {
                responseElement.classList.add('incorrect');

                // 不正解の効果音を再生
                document.getElementById('incorrect-sound').play();
            }
            console.log('Adding response to log:', responseElement); // デバッグ用ログ
            document.getElementById('responses').appendChild(responseElement); // 回答ログを追加
        }

        if (message.type === 'playCorrectSound') {
            document.getElementById('correct-sound').play(); // 正解の効果音を再生
        }
        if (message.type === 'updateScores') {
            // HP表示を更新
            updateHP(message.hp);
        }
        if (message.type === 'endGame') {
            document.getElementById('quiz-section').style.display = 'none';
            document.getElementById('ready-message').style.display = 'none';
            document.getElementById('next-question').style.display = 'none';
            updateHP(message.hp); // 勝利カットイン前にHPを更新
            showVictoryCutin(); // 勝利カットインを表示

            document.getElementById('end-game').classList.remove('hidden');
            document.getElementById('end-game').style.display = 'block';
            document.getElementById('winner-message').textContent = message.winner; // 勝者メッセージを表示
            console.log("End game modal should be visible now");
        }
        if (message.type === 'showNextButton') {
            if (!victoryDisplayed) {
                document.getElementById('next-question').style.display = 'block';
            }
        }
        if (message.type === 'waitingForNext') {
            document.getElementById('waiting-next').textContent = `${message.usersReady.join(", ")} は待機済みです`;
        }
        if (message.type === 'startNextQuiz') {
            startCountdownForNext(); // 次の問題のカウントダウンを開始
        }

        // 回答欄をリセットする処理を追加
        if (message.type === 'clearAnswerInput') {
            document.getElementById('answer').value = ''; // 回答欄をリセット
        }
    };


    ws.onclose = () => {
        console.log('WebSocket connection closed. Reconnecting...');
        setTimeout(connectWebSocket, 1000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function sendAnswer() {
    const answerInput = document.getElementById('answer');
    const answer = answerInput.value;

    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'answer', user: user, answer: answer }));
        answerInput.value = '';
    } else {
        console.error('WebSocket is not open. Ready state: ' + ws.readyState);
    }
}

function readyForNextQuestion() {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'readyForNextQuestion', user: user }));
        document.getElementById('next-question').style.display = 'none'; // ボタンがクリックされたら非表示にする
        document.getElementById('waiting-next').textContent = `${user} は待機済みです`; // 対戦相手の返事を待つメッセージを表示
    }
}

function startQuiz() {
    user = document.getElementById('username').value;
    if (user) {
        console.log(`Starting quiz for user: ${user}`);
        document.getElementById('user-section').style.display = 'none';
        document.getElementById('waiting-message').style.display = 'block';
        showSpinner(); // スピナーを表示

        // GO効果音を再生
        document.getElementById('go-sound').play();

        connectWebSocket();
        // 状態3BGMを再生
        let state3Bgm = document.getElementById('state3-bgm');
        state3Bgm.volume = 0.2; // 音量を50%に設定
        state3Bgm.play();
    } else {
        alert('Please enter a username');
    }
}

function cancel() {
    alert('Canceled');
}

function startCountdown() {
    let countdown = 6;  // カウントダウンの開始時間を6秒に変更
    const countdownElement = document.getElementById('countdown');
    countdownElement.textContent = countdown; // 初期値の設定
    const interval = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            countdownElement.textContent = countdown;
        } else if (countdown === 0) {
            countdownElement.textContent = "Fight!";
        } else {
            clearInterval(interval);
            // カウントダウンが0になった時に問題を表示する
            ws.send(JSON.stringify({ type: 'startQuizRequest', user: user }));
        }
        document.getElementById('countdown-sound').play(); // カウントダウン効果音を再生
    }, 1000);
}

function startCountdownForNext() {
    document.getElementById('quiz-section').style.display = 'none';
    document.getElementById('ready-message').style.display = 'block';
    startCountdown(); // カウントダウンを開始
    setTimeout(() => {
        document.getElementById('ready-message').style.display = 'none';
        document.getElementById('quiz-section').style.display = 'block';
        document.getElementById('next-question').style.display = 'none'; // カウントダウン中は非表示にする
    }, 6000);  // 6秒後に画面を切り替える
}

function disableInput() {
    document.getElementById('answer').disabled = true;
    document.querySelector('button[onclick="sendAnswer()"]').disabled = true;
}

function enableInput() {
    document.getElementById('answer').disabled = false;
    document.querySelector('button[onclick="sendAnswer()"]').disabled = false;
}

function updateHP(hp) {
    userHP = new Map(hp);
    const myHpBarInner = document.querySelector('#my-hp .hp-bar-inner');
    const opponentHpBarInner = document.querySelector('#opponent-hp .hp-bar-inner');

    hp.forEach(([username, hpValue]) => {
        const percentage = hpValue * 20;
        let color;
        if (percentage > 65) {
            color = username === user ? 'linear-gradient(to left, #08c508, #02b802 100%)' : 'linear-gradient(to right, #08c508, #02b802 100%)';
        } else if (percentage > 30) {
            color = username === user ? 'linear-gradient(to left, #ffff99, #ffcc00 100%)' : 'linear-gradient(to right, #ffff99, #ffcc00 100%)';
        } else {
            color = username === user ? 'linear-gradient(to left, #ff0000, #990000)' : 'linear-gradient(to right, #ff0000, #990000)';
        }
        if (username === user) {
            myHpBarInner.style.width = `${percentage}%`;
            myHpBarInner.style.background = color;
        } else {
            opponentHpBarInner.style.width = `${percentage}%`;
            opponentHpBarInner.style.background = color;
        }
    });
}

function showReadyImage() {
    const readyElement = document.getElementById('ready');
    readyElement.style.display = 'block';
    readyElement.classList.add('show');
    setTimeout(() => {
        readyElement.classList.remove('show');
        readyElement.style.display = 'none';
    }, 3000);
}

function showAttack() {
    if (!victoryDisplayed) { // 勝利カットインが表示されていない場合のみ実行
        const attackElement = document.getElementById('attack');
        const cutinBackground = document.getElementById('cutin-background');
        cutinBackground.classList.add('show');
        cutinBackground.classList.add('attack-background'); // ATTACK用背景画像を設定
        attackElement.classList.add('animate');

        // 攻撃効果音を再生
        document.getElementById('attack-sound').play();

        setTimeout(() => {
            attackElement.classList.remove('animate');
            cutinBackground.classList.remove('show');
            cutinBackground.classList.remove('attack-background'); // 背景画像をリセット
        }, 4000);
    }
}

function showDamage() {
    if (!victoryDisplayed) { // 勝利カットインが表示されていない場合のみ実行
        const damageElement = document.getElementById('damage');
        const cutinBackground = document.getElementById('cutin-background');
        cutinBackground.classList.add('show');
        cutinBackground.classList.add('damage-background'); // DAMAGE用背景画像を設定
        damageElement.classList.add('animate');

        // ダメージ効果音を再生
        document.getElementById('damage-sound').play();

        setTimeout(() => {
            damageElement.classList.remove('animate');
            cutinBackground.classList.remove('show');
            cutinBackground.classList.remove('damage-background'); // 背景画像をリセット
            updateHP(Array.from(userHP)); // ダメージ表示後にHPを更新
        }, 4000);
    }
}

function showVictoryCutin() {
    const victoryElement = document.getElementById('victory');
    victoryElement.classList.add('show');
    victoryDisplayed = true; // フラグを設定

    // 勝利カットイン効果音を再生
    document.getElementById('victory-sound1').play();
    setTimeout(() => {
        document.getElementById('victory-sound2').play();
    }, 4000); // 5秒後に2つ目の効果音を再生

    setTimeout(() => {
        victoryElement.classList.remove('show');
        document.getElementById('main-content').style.backgroundImage = 'url("./Img/KOafter.gif")';
        document.getElementById('final-image').style.display = 'block';

        // Final-imageが表示されるタイミングで効果音を再生
        document.getElementById('final-sound').play();

        // 3秒後にモーダルを表示
        setTimeout(() => {
            document.getElementById('end-game').classList.remove('hidden');
        }, 3000);

    }, 7000); // 7秒後に非表示にする
}

function restartGame() {
    document.getElementById('end-game').classList.add('hidden');
    document.getElementById('responses').innerHTML = '';
    document.querySelector('#my-hp .hp-bar-inner').style.width = '100%';
    document.querySelector('#opponent-hp .hp-bar-inner').style.width = '100%';
    document.querySelector('#my-hp .hp-bar-inner').style.backgroundColor = 'green';
    document.querySelector('#opponent-hp .hp-bar-inner').style.backgroundColor = 'green';
    document.getElementById('user-section').style.display = 'block';
    document.getElementById('final-background').style.display = 'none';
    document.getElementById('final-image').style.display = 'none';
    victoryDisplayed = false; // フラグをリセット
    user = '';
    ws.close();
}

function returnToTitle() {
    window.location.href = 'https://axella1.sakura.ne.jp/project/splash'; // タイトル画面のURLにリダイレクト
}

function showSpinner() {
    document.getElementById('loading-spinner').style.display = 'block';
}

function hideSpinner() {
    document.getElementById('loading-spinner').style.display = 'none';
}
