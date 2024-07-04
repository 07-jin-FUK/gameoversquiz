const http = require('http');
const WebSocket = require('ws');
const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 443;

// 静的ファイルの提供
app.use(express.static(path.join(__dirname, 'public')));

// ルートパスに対するリクエストを処理
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = [];
let connectedUsers = new Map(); // ユーザーとスコアを管理するMap
let userHP = new Map(); // ユーザーとHPを管理するMap
let readyForNextQuestion = new Set();
const questions = [
    { question: "複数のテーブルから関連する列を基にデータを取得するために使用されるSQL句は何ですか？", example: "SELECT * FROM table1 INNER ____ table2 ON table1.id = table2.id;", answer: "JOIN", type: "normal" },
    { question: "テーブル内の行数を数えるために使用されるSQL関数は何ですか？", example: "SELECT ____(*) FROM table1;", answer: "COUNT", type: "normal" },
    { question: "レコードをフィルタリングするために使用されるSQL句は何ですか？", example: "SELECT * FROM table1 ____ condition;", answer: "WHERE", type: "normal" },
    { question: "列内の最大値を見つけるために使用されるSQL関数は何ですか？", example: "SELECT ____(column_name) FROM table1;", answer: "MAX", type: "normal" },
    { question: "テーブルに新しいレコードを挿入するために使用されるSQL文は何ですか？", example: "____ ____ table1 (column1, column2) VALUES (value1, value2);", answer: "INSERT INTO", type: "normal" },
    { question: "テーブルからレコードを削除するために使用されるSQL文は何ですか？", example: "____ FROM table1 WHERE condition;", answer: "DELETE", type: "normal" },
    { question: "数値列の平均値を返すために使用されるSQL関数は何ですか？", example: "SELECT ____(column_name) FROM table1;", answer: "AVG", type: "normal" },
    { question: "結果セットを並べ替えるために使用されるSQL句は何ですか？", example: "SELECT * FROM table1 ____ column_name ASC;", answer: "ORDER BY", type: "normal" },
    { question: "テーブル内の既存のレコードを更新するために使用されるSQL文は何ですか？", example: "____ table1 SET column1 = value1 WHERE condition;", answer: "UPDATE", type: "normal" },
    { question: "数値列の値を合計するために使用されるSQL関数は何ですか？", example: "SELECT ____(column_name) FROM table1;", answer: "SUM", type: "normal" },
    { question: "！ラッキー問題！これに正解するとHPが20％回復+相手ダメージ！G’s名言、次に入るものは？", example: "code is ____", answer: "量", type: "lucky" },
    { question: "！正解でダメージ2倍！このゲームのタイトルは？", example: "Why ____?;", answer: "Fight", type: "danger" },
];
const maxHP = 5; // 最大HP
let quizActive = false;
let currentQuestionIndex = 0;
let askedQuestions = new Set(); // 出題済みの問題をトラッキング

wss.on('connection', ws => {
    clients.push(ws);
    console.log('New client connected');

    ws.on('message', message => {
        const parsedMessage = JSON.parse(message);
        console.log('Received message:', parsedMessage);

        if (parsedMessage.type === 'register') {
            // 古いユーザーが既に存在する場合、古い接続を削除
            if (connectedUsers.has(parsedMessage.user)) {
                clients = clients.filter(client => client !== ws);
                console.log(`Old connection for user ${parsedMessage.user} removed`);
            }

            connectedUsers.set(parsedMessage.user, 0); // 新しいユーザーをスコア0で登録
            userHP.set(parsedMessage.user, maxHP); // 新しいユーザーをHP5で登録
            console.log(`User registered: ${parsedMessage.user}`);
            console.log('Connected users:', Array.from(connectedUsers.keys()));

            if (connectedUsers.size >= 2 && !quizActive) {
                console.log('Notifying clients to start quiz');
                quizActive = true;
                const initialScores = Array.from(connectedUsers.entries());
                const initialHP = Array.from(userHP.entries());
                clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'readyToStart', initialScores, initialHP }));
                    }
                });

                setTimeout(() => {
                    sendQuestion();
                }, 9000);
            }
        } else if (parsedMessage.type === 'answer' && quizActive) {
            console.log(`Received answer from ${parsedMessage.user}: ${parsedMessage.answer}`);

            let result = {
                user: parsedMessage.user,
                answer: parsedMessage.answer,
                correct: false,
            };

            const currentQuestion = questions[currentQuestionIndex];
            if (parsedMessage.answer.toLowerCase() === currentQuestion.answer.toLowerCase()) {
                result.correct = true;
                let currentScore = connectedUsers.get(parsedMessage.user);
                connectedUsers.set(parsedMessage.user, currentScore + 1); // スコアを更新
                console.log(`${parsedMessage.user} scored! Current score: ${currentScore + 1}`);

                if (currentQuestion.type === "lucky") {
                    let currentHP = userHP.get(parsedMessage.user);
                    userHP.set(parsedMessage.user, Math.min(currentHP + 1, maxHP)); // HPを回復
                    console.log(`${parsedMessage.user}'s HP increased to ${currentHP + 1}`);
                }

                let opponentDefeated = false; // 敵が倒されたかどうかを示すフラグ

                // 相手のHPを減らす
                for (let [user, hp] of userHP.entries()) {
                    if (user !== parsedMessage.user) {
                        let damage = currentQuestion.type === "danger" ? 2 : 1; // デンジャー問題の場合はダメージ2倍
                        if (hp - damage <= 0) {
                            userHP.set(user, 0); // 相手のHPを0に設定
                            quizActive = false;
                            opponentDefeated = true; // 敵が倒されたことを示す
                            console.log(`${parsedMessage.user} has won the game!`);
                            result.winner = true; // 勝者を示すフラグを追加

                            // 勝者を通知し、ゲームを終了
                            clients.forEach(client => {
                                if (client.readyState === WebSocket.OPEN) {
                                    client.send(JSON.stringify({
                                        type: 'endGame',
                                        winner: `${parsedMessage.user} WIN!!`,
                                        hp: Array.from(userHP.entries())
                                    }));
                                }
                            });

                            // ゲーム終了後にリセット
                            resetGame();
                            break;
                        } else {
                            userHP.set(user, hp - damage);
                            console.log(`${user}'s HP decreased to ${hp - damage}`);
                        }
                    }
                }

                result.scores = Array.from(connectedUsers.entries()); // スコア更新後に送信
                result.hp = Array.from(userHP.entries()); // HP更新後に送信

                // スコア更新をクライアントに送信
                clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'updateScores', scores: result.scores, hp: result.hp }));
                    }
                });

                // 正解音を再生する
                if (!opponentDefeated) {
                    clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ type: 'playCorrectSound' }));
                        }
                    });
                }
            }

            // 回答をクライアントに送信（正解/不正解に関係なく）
            clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'answer', ...result }));
                }
            });

            // 問題が終了した場合、次の問題を始めるボタンを表示
            if (result.correct && quizActive) {
                clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'showNextButton' }));
                    }
                });
            }
        } else if (parsedMessage.type === 'readyForNextQuestion' && quizActive) {
            readyForNextQuestion.add(parsedMessage.user);
            if (readyForNextQuestion.size === connectedUsers.size) {
                readyForNextQuestion.clear();
                clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'startNextQuiz' })); // 次のクイズ開始のカウントダウンを指示
                    }
                });
                setTimeout(() => {
                    sendQuestion();
                }, 6000); // 6秒後に次の問題を開始
            }
            clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'waitingForNext', usersReady: Array.from(readyForNextQuestion) }));
                }
            });

            // 回答欄をクリアするメッセージをクライアントに送信
            clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'clearAnswerInput' }));
                }
            });
        } else if (parsedMessage.type === 'startQuizRequest') {
            console.log('startQuizRequest received'); // デバッグ用ログ
            // sendQuestion();
        }
    });

    ws.on('close', () => {
        clients = clients.filter(client => client !== ws);
        console.log('Client disconnected');
        // 切断されたユーザーを削除
        connectedUsers.forEach((score, user) => {
            if (!clients.some(client => client.user === user)) {
                connectedUsers.delete(user);
                userHP.delete(user);
                console.log(`Removed user ${user} from connectedUsers`);
            }
        });
        clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'opponentDisconnected' }));
            }
        });

        resetGame();
    });
});

function sendQuestion() {
    console.log('sendQuestion called'); // デバッグ用ログ
    // 新しい質問を見つける
    let availableQuestions = questions.filter((_, index) => !askedQuestions.has(index));
    console.log('availableQuestions:', availableQuestions.length); // デバッグ用ログ
    if (availableQuestions.length === 0) {
        console.log('All questions have been asked.');
        resetGame();
        return;
    }
    let newQuestionIndex = Math.floor(Math.random() * availableQuestions.length);
    currentQuestionIndex = questions.indexOf(availableQuestions[newQuestionIndex]);
    askedQuestions.add(currentQuestionIndex);
    console.log('New question index:', currentQuestionIndex); // デバッグ用ログ

    const question = questions[currentQuestionIndex];
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'startQuiz', question: question.question, example: question.example, questionType: question.type }));
        }
    });
}

function resetGame() {
    console.log('resetGame called'); // デバッグ用ログ
    // ゲームのリセット、ユーザーのスコアもクリアする
    connectedUsers.clear();
    userHP.clear();
    readyForNextQuestion.clear();
    askedQuestions.clear(); // 出題済みの問題リストをクリア
    currentQuestionIndex = 0;
    quizActive = false;
}

server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
