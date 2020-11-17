const functions = require('firebase-functions');
const admin = require('firebase-admin');
const requestPromise = require('request-promise');
const { WebhookClient } = require('dialogflow-fulfillment');

process.env.DEBUG = 'dialogflow:debug';

admin.initializeApp(functions.config().firebase);

const db = admin.database().ref('problems');


const LINE_MESSAGING_API = "https://api.line.me/v2/bot/message";
const LINE_HEADER = {
  "Content-Type": "application/json",
  Authorization: `Bearer 2vAD+m+M0zdZ975e+SEQ+tvYOoJHdSuXtV83n1k3o0g9uWB/ag756qd/6FX82unMjDXGwrsEjtHiEF6zB4LpJmI9tqbT+BHYQgH+yjsgP67P5b/VaCDMu/kHbSD+qYRCKRzzgudyeiVI4uYE2282fAdB04t89/1O/w1cDnyilFU=`
};


exports.helloWorld = functions.https.onRequest((request, response) => {
  functions.logger.info("Hello logs!", {structuredData: true});
  response.send("Hello from Firebase!3");
});

exports.webhook = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });

  const userField = request.body.originalDetectIntentRequest;
  let userId;

  if (userField && userField.source === 'line') {
    userId = userField.payload.data.source.userId;
  }

  function Int_problem_condition(agent) {
    // save data to db before keep location
    const resultInput = request.body.queryResult;
    const contexts = resultInput.outputContexts[1].parameters;
    const title = contexts.title;
    const description = contexts.description;
    const output = contexts.output;
    const condition = contexts.condition;

    console.log(contexts);

    
    db.child(userId).push({
      title,
      description,
      output,
      condition,
    });
    console.log(request.body);
    return;
  }

  function Int_problem_confirm(agent) {
    agent.add('ส่งเรื่องเรียบร้อยแล้วจ้า');
  }

  let intenMap = new Map();
  intenMap.set('Int_problem_confirm', Int_problem_confirm);
  intenMap.set('Int_problem_condition', Int_problem_condition);

  agent.handleRequest(intenMap);
  return;
  // response.send(200);
});

exports.lineAdapter = functions.https.onRequest((req, res) => {
  if (req.method !== 'POST') return;
  let event = req.body.events[0];
  console.log("message:" , req.body.events[0].message);
  if (event.type === 'message' && event.message.type === 'text') {
    postToDialogflow(req);
  } else {
    reply(req)
  }
  res.send(200);
});

const reply = req => {
  const event = req.body.events[0];
  if (event.message.type === 'location') {
    const location = event.message; 
    const userId = event.source.userId

    return db.child(userId).orderByKey().limitToLast(1).once('value', snapshot => {
      snapshot.forEach(data => {
        const itemKey = data.key;
        const val = data.val();
        const newData = {...val, address: location.address, latitude: location.latitude, longitude: location.longitude }
        return db.child(userId).child(itemKey).set(newData).then(() => {
          return requestPromise.post({
            uri: `${LINE_MESSAGING_API}/reply`,
            headers: LINE_HEADER,
            body: JSON.stringify({
              replyToken: req.body.events[0].replyToken,
              messages: [
                {
                  type: "text",
                  text: "ยืนยันการรายงานปัญหา",
                  quickReply: {
                    items: [
                      {
                        type: "action",
                        action: {
                          type: "message",
                          label: "yes",
                          text: "yes"
                        }
                      },
                      {
                        type: "action",
                        action: {
                          type: "message",
                          label: "no",
                          text: "no"
                        }
                      },
                    ]
                  }
                }
              ]
            }),
          });
        });
      });
    });
  }
  return {};
};

const postToDialogflow = req => {
  req.headers.host = 'bots.dialogflow.com';
  return requestPromise.post({
    uri: 'https://bots.dialogflow.com/line/303b60d9-964d-4d7b-b6be-0858266e9809/webhook',
    headers: req.headers,
    body: JSON.stringify(req.body)
  });
}
