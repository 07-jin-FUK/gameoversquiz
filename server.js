const WebSocket = require('ws');
const port = process.env.PORT || 443;

const wss = new WebSocket.Server({ port: port });
console.log(`WebSocket server is running on ws://localhost:${port}`);

// ここからは以前のコードのまま

let clients = [];
let connectedUsers = new Map(); // ユーザーとスコアを管理するMap
let userHP = new Map(); // ユーザーとHPを管理するMap
let readyForNextQuestion = new Set();
const questions = [
    { question: "複数のテーブルから関連する列を基にデータを取得するために使用されるSQL句は何ですか？", example: "SELECT * FROM table1 INNER ____ table2 ON table1.id = table2.id;", answer: "JOIN" },
    { question: "テーブル内の行数を数えるために使用されるSQL関数は何ですか？", example: "SELECT ____(*) FROM table1;", answer: "COUNT" },
    { question: "レコードをフィルタリングするために使用されるSQL句は何ですか？", example: "SELECT * FROM table1 ____ condition;", answer: "WHERE" },
    { question: "列内の最大値を見つけるために使用されるSQL関数は何ですか？", example: "SELECT ____(column_name) FROM table1;", answer: "MAX" },
    { question: "テーブルに新しいレコードを挿入するために使用されるSQL文は何ですか？", example: "____ ____ table1 (column1, column2) VALUES (value1, value2);", answer: "INSERT INTO" },
    { question: "テーブルからレコードを削除するために使用されるSQL文は何ですか？", example: "____ FROM table1 WHERE condition;", answer: "DELETE" },
    { question: "数値列の平均値を返すために使用されるSQL関数は何ですか？", example: "SELECT ____(column_name) FROM table1;", answer: "AVG" },
    { question: "結果セットを並べ替えるために使用されるSQL句は何ですか？", example: "SELECT * FROM table1 ____ column_name ASC;", answer: "ORDER BY" },
    { question: "テーブル内の既存のレコードを更新するために使用されるSQL文は何ですか？", example: "____ table1 SET column1 = value1 WHERE condition;", answer: "UPDATE" },
    { question: "数値列の値を合計するために使用されるSQL関数は何ですか？", example: "SELECT ____(column_name) FROM table1;", answer: "SUM" }
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
            // ユーザーが既に登録されている場合はスコアとHPをリセット
            if (connectedUsers.has(parsedMessage.user)) {
                connectedUsers.delete(parsedMessage.user);
                userHP.delete(parsedMessage.user);
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

            if (parsedMessage.answer.toLowerCase() === questions[currentQuestionIndex].answer.toLowerCase()) {
                result.correct = true;
                let currentScore = connectedUsers.get(parsedMessage.user);
                connectedUsers.set(parsedMessage.user, currentScore + 1); // スコアを更新
                console.log(`${parsedMessage.user} scored! Current score: ${currentScore + 1}`);

                // 相手のHPを減らす
                for (let [user, hp] of userHP.entries()) {
                    if (user !== parsedMessage.user) {
                        userHP.set(user, hp - 1);
                        console.log(`${user}'s HP decreased to ${hp - 1}`);
                        if (hp - 1 <= 0) {
                            quizActive = false;
                            console.log(`${parsedMessage.user} has won the game!`);
                            result.winner = true; // 勝者を示すフラグを追加

                            // 勝者を通知し、ゲームを終了
                            clients.forEach(client => {
                                if (client.readyState === WebSocket.OPEN) {
                                    client.send(JSON.stringify({ type: 'endGame', winner: `${parsedMessage.user} WIN!!`, hp: Array.from(userHP.entries()) }));
                                }
                            });

                            // ゲーム終了後にリセット
                            resetGame();
                            break;
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
            }

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
        } else if (parsedMessage.type === 'startQuizRequest') {
            console.log('startQuizRequest received'); // デバッグ用ログ
            // sendQuestion();
        }
    });

    ws.on('close', () => {
        clients = clients.filter(client => client !== ws);
        console.log('Client disconnected');
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
            client.send(JSON.stringify({ type: 'startQuiz', question: question.question, example: question.example }));
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
